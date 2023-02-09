import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';

export class ApplicationStack extends cdk.Stack {
    private readonly API_RESOURCE_NAME = 'blog-test-app'
    private readonly DDB_PARTITION_KEY = 'itemId'
    private readonly APIGATEWAY_STAGE_NAME = 'v1'

    public readonly endpointCfnOutput: cdk.CfnOutput

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const apiGatewayAccessLogGroup = new logs.LogGroup(this, "ApiGatewayAccessLogGroup", { logGroupName: cdk.Fn.sub("apigw-access-logs-${AWS::StackName}"), removalPolicy: cdk.RemovalPolicy.DESTROY, retention: 7 })

        const ddbTable = new dynamodb.Table(this, "Table", {
            tableName: cdk.Fn.sub("blog-test-app-table-${AWS::StackName}"),
            partitionKey: {
                name: this.DDB_PARTITION_KEY,
                type: dynamodb.AttributeType.STRING
            },
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            encryption: dynamodb.TableEncryption.AWS_MANAGED,
        })

        const lambdaIamRole = new iam.Role(this, "LambdaRole", {
            assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
            description: "Lambda IAM role",
            managedPolicies: [
                iam.ManagedPolicy.fromManagedPolicyArn(this, "Lambda-ManagedPolicy-1", "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"),
            ]
        })
        const lambdaFunction = new lambda.Function(this, "AppLambda", {
            code: lambda.Code.fromAsset('sample-app/lambda'),
            handler: 'app.handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            role: lambdaIamRole,
            description: "Sample application Lambda code",
            logRetention: 7,
            timeout: cdk.Duration.seconds(30),
            environment: {
                TABLE_NAME: ddbTable.tableName,
                PRIMARY_KEY: this.DDB_PARTITION_KEY
            }
        })
        lambdaFunction.grantInvoke(new iam.ServicePrincipal("apigateway.amazonaws.com"))
        ddbTable.grantReadWriteData(lambdaFunction)

        const apigatewayIamRole = new iam.Role(this, "ApiGatewayIAMRole", {
            assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
            managedPolicies: [
                iam.ManagedPolicy.fromManagedPolicyArn(this, "apigw-managed-policy-1", "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"),
                iam.ManagedPolicy.fromManagedPolicyArn(this, "apigw-managed-policy-2", "arn:aws:iam::aws:policy/service-role/AWSLambdaRole")
            ],
            description: "API Gateway IAM role",
        })
        const restApi = new apigateway.RestApi(this, "RestApi", {
            parameters: { endpointConfigurationTypes: "REGIONAL" },
            endpointConfiguration: { types: [apigateway.EndpointType.REGIONAL] },
            deploy: true,
            description: "Sample application API Gateway",
            deployOptions: {
                accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields(),
                accessLogDestination: new apigateway.LogGroupLogDestination(apiGatewayAccessLogGroup),
                description: "API Gateway stage",
                loggingLevel: apigateway.MethodLoggingLevel.INFO,
                stageName: this.APIGATEWAY_STAGE_NAME,
            },
        })
        new logs.LogGroup(this, "ApiGatewayLogsGroup", { logGroupName: `API-Gateway-Execution-Logs_${restApi.restApiId}/${this.APIGATEWAY_STAGE_NAME}`, removalPolicy: cdk.RemovalPolicy.DESTROY, retention: 7 })

        const apiResource = restApi.root.addResource(this.API_RESOURCE_NAME)
        const lambdaIntegration = new apigateway.LambdaIntegration(lambdaFunction)
        apiResource.addMethod('GET', lambdaIntegration)
        new apigateway.CfnAccount(this, "ApiGatewayAccount", {cloudWatchRoleArn: apigatewayIamRole.roleArn})

        this.endpointCfnOutput = new cdk.CfnOutput(this, 'Endpoint', {
            value: `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/${this.APIGATEWAY_STAGE_NAME}/${this.API_RESOURCE_NAME}`
        })
    }
}