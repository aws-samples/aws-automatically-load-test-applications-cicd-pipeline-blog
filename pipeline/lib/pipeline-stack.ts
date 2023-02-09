import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as assets from 'aws-cdk-lib/aws-s3-assets';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as pipeline from 'aws-cdk-lib/pipelines';
import * as path from 'path'
import { Construct } from 'constructs';
import { ApplicationStack } from '../sample-app/application-stack'
import loadTestEnvVars from '../loadTestEnvVariables.json'

export class PipelineStage extends cdk.Stage {
    public readonly endpointCfnOutput: cdk.CfnOutput
    constructor(scope: Construct, id: string, props?: cdk.StageProps) {
        super(scope, id, props)
        const service = new ApplicationStack(this, "Application")
        this.endpointCfnOutput = service.endpointCfnOutput
    }
}

export class PipelineStack extends cdk.Stack {
    private readonly REPOSITORY_NAME = "blog-repo"
    private readonly PIPELINE_NAME = "blog-pipeline"

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const repo = new codecommit.Repository(this, "BlogAppRepo", {
            repositoryName: this.REPOSITORY_NAME,
            code: codecommit.Code.fromAsset(new assets.Asset(this, 'RepoAsset', {
                path: path.join(__dirname, '../../'),
                exclude: [
                    'cdk.out',
                    'node_modules',
                    '.git',
                ]
            }), 'main')
        })

        const codepipelineResource = new codepipeline.Pipeline(this, "BlogPipeline", {
            artifactBucket: new s3.Bucket(this, "ArtifactsBucket", {
                autoDeleteObjects: true,
                removalPolicy: cdk.RemovalPolicy.DESTROY,
                encryption: s3.BucketEncryption.KMS_MANAGED
            }),
            pipelineName: this.PIPELINE_NAME
        })

        const appPipeline = new pipeline.CodePipeline(this, "BlogAppPipeline", {
            codePipeline: codepipelineResource,
            synth: new pipeline.CodeBuildStep("Synthesize-CloudFormation", {
                input: pipeline.CodePipelineSource.codeCommit(repo, 'main'),
                installCommands: [
                    'npm install -g aws-cdk'
                ],
                commands: [
                    'cd pipeline',
                    'npm ci',
                    'npm run build',
                    'npx cdk synth',
                ],
                primaryOutputDirectory: 'pipeline/cdk.out'
            })
        })

        const appDeployDevStage = new PipelineStage(this, 'Development-Deploy')
        appPipeline.addStage(appDeployDevStage, {
            post: [
                new pipeline.CodeBuildStep("LoadTest", {
                    buildEnvironment: {
                        buildImage: codebuild.LinuxBuildImage.fromDockerRegistry('public.ecr.aws/bitnami/node:18.4.0')
                    },
                    envFromCfnOutputs: {
                        APP_END_POINT: appDeployDevStage.endpointCfnOutput
                    },
                    installCommands: [
                        "apt-get -q update && apt-get -q install -y curl jq unzip less",
                        "TOKEN=$(curl http://169.254.170.2$AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)",
                        "export AWS_ACCESS_KEY_ID=$(echo ${TOKEN} | jq -r '.AccessKeyId')",
                        "export AWS_SECRET_ACCESS_KEY=$(echo ${TOKEN} | jq -r '.SecretAccessKey')",
                        "export AWS_SESSION_TOKEN=$(echo ${TOKEN} | jq -r '.Token')",
                    ],
                    commands: [
                        "echo $LOAD_TEST_API_ENDPOINT",
                        "echo $FAILURE_THRESHOLD",
                        "echo $AVG_RT_THRESHOLD",
                        "echo $APP_END_POINT",
                        "cd utils",
                        "npm install",
                        "npm ci",
                        "node_modules/typescript/bin/tsc load-test.ts",
                        "node load-test.js"
                    ],
                    env: {
                        LOAD_TEST_API_ENDPOINT: loadTestEnvVars.LOAD_TEST_API_ENDPOINT,
                        FAILURE_THRESHOLD: loadTestEnvVars.FAILURE_THRESHOLD,
                        AVG_RT_THRESHOLD: loadTestEnvVars.AVG_RT_THRESHOLD,
                    },
                    rolePolicyStatements: [new iam.PolicyStatement({
                        actions: ['execute-api:Invoke'],
                        resources: ['*'],
                        sid: "InvokeApi"
                    })]
                })
            ]
        })

        appPipeline.addStage(new PipelineStage(this, 'Production-Deploy'))
    }
}

const app = new cdk.App();
new PipelineStack(app, 'PipelineStack');