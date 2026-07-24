#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { VgcEloStack } from '../lib/vgc-elo-stack';

const app = new App();

// Environment-agnostic on purpose: this lets `cdk synth` run without real
// AWS credentials (VPC AZs resolve via Fn::GetAZs instead of a live lookup).
// `cdk deploy` still needs real credentials + `cdk bootstrap` to actually provision anything.
new VgcEloStack(app, 'VgcEloStack');
