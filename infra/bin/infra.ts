#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { VgcEloStack } from '../lib/vgc-elo-stack';
import { IngestScheduleStack } from '../lib/ingest-schedule-stack';

const app = new App();

// Environment-agnostic on purpose: this lets `cdk synth` run without real
// AWS credentials (VPC AZs resolve via Fn::GetAZs instead of a live lookup).
// `cdk deploy` still needs real credentials + `cdk bootstrap` to actually provision anything.

// Full AWS showcase (VPC + RDS + Fargate web service). Not needed for the Vercel/Neon deploy.
new VgcEloStack(app, 'VgcEloStack');

// Standalone scheduled ingestion for the Neon database (no RDS). Configure with
// context, e.g. `cdk synth -c ingestCron="0 6 1 * *" -c limitlessKeySecretName=vgc-elo/limitless-api-key`.
new IngestScheduleStack(app, 'VgcIngestScheduleStack', {
    cron: app.node.tryGetContext('ingestCron'),
    databaseUrlSecretName: app.node.tryGetContext('databaseUrlSecretName'),
    limitlessKeySecretName: app.node.tryGetContext('limitlessKeySecretName'),
    imageTag: app.node.tryGetContext('ingestImageTag'),
    alertEmail: app.node.tryGetContext('alertEmail'),
});
