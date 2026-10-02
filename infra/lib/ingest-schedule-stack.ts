import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';

export interface IngestScheduleProps extends StackProps {
    /** Standard 5-field cron (min hour day-of-month month day-of-week), UTC. Default: 06:00 on the 1st monthly. */
    cron?: string;
    /** Secrets Manager secret (plain string) holding the Neon UNPOOLED connection string -> DATABASE_URL. */
    databaseUrlSecretName?: string;
    /** Optional Secrets Manager secret (plain string) holding LIMITLESS_API_KEY. Omit to not inject one. */
    limitlessKeySecretName?: string;
    /** ECR repo for the ingest image (built with `docker build --target ingest`). Created if it doesn't exist in this stack. */
    imageTag?: string;
    /** Hard cap on one run; the container wraps `npm run ingest` in `timeout`. */
    timeoutMinutes?: number;
    /** Optional email to notify when a run stops with a non-zero exit code. */
    alertEmail?: string;
}

/**
 * Scheduled `npm run ingest` on ECS Fargate via EventBridge, as an alternative to the GitHub Action.
 * Standalone: no RDS (the database is Neon), no NAT gateway (tasks get a public IP in a public subnet,
 * with an inbound-deny security group), no load balancer.
 */
export class IngestScheduleStack extends Stack {
    constructor(scope: Construct, id: string, props: IngestScheduleProps = {}) {
        super(scope, id, props);

        const cron = props.cron ?? '0 6 1 * *';
        const timeoutMinutes = props.timeoutMinutes ?? 120;
        const imageTag = props.imageTag ?? 'latest';

        // --- network: public subnets only, no NAT (cheapest; Neon + Limitless are on the public internet) ---
        const vpc = new ec2.Vpc(this, 'Vpc', {
            maxAzs: 2,
            natGateways: 0,
            subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }],
        });
        const securityGroup = new ec2.SecurityGroup(this, 'TaskSg', {
            vpc,
            allowAllOutbound: true, // outbound only; no inbound rules are added
            description: 'VGC ingest task: egress only',
        });

        // --- image repo (push the --target ingest image here) ---
        const repository = new ecr.Repository(this, 'IngestRepo', {
            repositoryName: 'vgc-elo-ingest',
            removalPolicy: RemovalPolicy.RETAIN,
            imageScanOnPush: true,
            lifecycleRules: [{ maxImageCount: 5 }],
        });

        // --- secrets (referenced by name; values are created/rotated by you, never stored in the template) ---
        const databaseUrl = secretsmanager.Secret.fromSecretNameV2(
            this, 'DatabaseUrlSecret', props.databaseUrlSecretName ?? 'vgc-elo/database-url-unpooled'
        );
        const limitlessKey = props.limitlessKeySecretName
            ? secretsmanager.Secret.fromSecretNameV2(this, 'LimitlessKeySecret', props.limitlessKeySecretName)
            : undefined;

        const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

        const logGroup = new logs.LogGroup(this, 'IngestLogs', {
            retention: logs.RetentionDays.THREE_MONTHS,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'IngestTask', {
            cpu: 1024, // the Elo regression is CPU-bound; ~6s of CPU for all regulations plus I/O
            memoryLimitMiB: 2048,
            runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
        });
        // Task role (what the app code may do in AWS): deliberately has NO permissions -- ingest only talks to Neon + Limitless.
        // The execution role (image pull, log write, reading the two secrets) is least-privilege and auto-scoped by CDK
        // to this repo, this log group and exactly the secrets referenced below.

        taskDefinition.addContainer('ingest', {
            image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
            // ECS has no native task timeout, so bound the run in-container. Ingest is incremental/idempotent,
            // so a timed-out or failed run is simply resumed by the next scheduled run (or a manual run-task).
            command: ['timeout', '-s', 'TERM', String(timeoutMinutes * 60), 'npm', 'run', 'ingest'],
            logging: ecs.LogDrivers.awsLogs({ streamPrefix: 'ingest', logGroup }),
            secrets: {
                DATABASE_URL: ecs.Secret.fromSecretsManager(databaseUrl),
                ...(limitlessKey ? { LIMITLESS_API_KEY: ecs.Secret.fromSecretsManager(limitlessKey) } : {}),
            },
        });

        // --- schedule ---
        const [minute, hour, day, month, weekDay = '*'] = cron.trim().split(/\s+/);
        if (!minute || !hour || !day || !month) throw new Error(`Invalid cron "${cron}": expected 5 fields`);
        const rule = new events.Rule(this, 'MonthlyIngestRule', {
            description: 'Scheduled Limitless ingestion (npm run ingest)',
            // CDK fills in the "?" for whichever of day-of-month / day-of-week is omitted.
            schedule: events.Schedule.cron(
                weekDay !== '*' && day === '*' ? { minute, hour, month, weekDay } : { minute, hour, month, day }
            ),
        });
        rule.addTarget(new targets.EcsTask({
            cluster,
            taskDefinition,
            subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
            assignPublicIp: true,
            securityGroups: [securityGroup],
            platformVersion: ecs.FargatePlatformVersion.LATEST,
            // Retries cover EventBridge failing to *start* the task (capacity, throttling).
            retryAttempts: 2,
            maxEventAge: Duration.hours(1),
        }));

        // --- optional failure alert: task stopped with a non-zero exit code ---
        if (props.alertEmail) {
            const topic = new sns.Topic(this, 'IngestAlerts');
            topic.addSubscription(new subs.EmailSubscription(props.alertEmail));
            new events.Rule(this, 'IngestFailedRule', {
                eventPattern: {
                    source: ['aws.ecs'],
                    detailType: ['ECS Task State Change'],
                    detail: {
                        clusterArn: [cluster.clusterArn],
                        lastStatus: ['STOPPED'],
                        containers: { exitCode: [{ 'anything-but': 0 }] },
                    },
                },
                targets: [new targets.SnsTopic(topic)],
            });
        }

        new CfnOutput(this, 'IngestRepoUri', { value: repository.repositoryUri });
        new CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
        new CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
    }
}
