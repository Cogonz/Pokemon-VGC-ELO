import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration, SecretValue } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class VgcEloStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });

        const repository = new ecr.Repository(this, 'AppRepo', {
            repositoryName: 'vgc-elo',
            removalPolicy: RemovalPolicy.RETAIN,
        });

        const db = new rds.DatabaseInstance(this, 'Database', {
            engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
            instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            databaseName: 'vgc_elo',
            credentials: rds.Credentials.fromGeneratedSecret('vgc_elo_app'),
            removalPolicy: RemovalPolicy.SNAPSHOT,
        });

        // Auth.js secret (AUTH_SECRET, GitHub OAuth client id/secret) -- fill in
        // real values after deploy; this just reserves the secret + a placeholder shape.
        const appSecret = new secretsmanager.Secret(this, 'AppSecret', {
            // Real values get set post-deploy (see infra/README.md) -- this just
            // reserves a valid JSON secret shape to attach as ECS container secrets.
            secretObjectValue: {
                AUTH_SECRET: SecretValue.unsafePlainText('replace-me'),
                AUTH_GITHUB_ID: SecretValue.unsafePlainText('replace-me'),
                AUTH_GITHUB_SECRET: SecretValue.unsafePlainText('replace-me'),
            },
        });

        const service = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'AppService', {
            vpc,
            cpu: 256,
            memoryLimitMiB: 512,
            desiredCount: 1,
            taskImageOptions: {
                image: ecs.ContainerImage.fromEcrRepository(repository, 'latest'),
                containerPort: 3000,
                environment: {
                    PGPORT: '5432',
                    PGDATABASE: 'vgc_elo',
                },
                secrets: {
                    PGHOST: ecs.Secret.fromSecretsManager(db.secret!, 'host'),
                    PGUSER: ecs.Secret.fromSecretsManager(db.secret!, 'username'),
                    PGPASSWORD: ecs.Secret.fromSecretsManager(db.secret!, 'password'),
                    AUTH_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'AUTH_SECRET'),
                    AUTH_GITHUB_ID: ecs.Secret.fromSecretsManager(appSecret, 'AUTH_GITHUB_ID'),
                    AUTH_GITHUB_SECRET: ecs.Secret.fromSecretsManager(appSecret, 'AUTH_GITHUB_SECRET'),
                },
            },
            healthCheckGracePeriod: Duration.seconds(60),
        });

        db.connections.allowFrom(service.service, ec2.Port.tcp(5432));

        new CfnOutput(this, 'AppUrl', { value: `http://${service.loadBalancer.loadBalancerDnsName}` });
        new CfnOutput(this, 'EcrRepoUri', { value: repository.repositoryUri });
    }
}
