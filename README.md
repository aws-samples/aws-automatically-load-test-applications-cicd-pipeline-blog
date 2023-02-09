# Load Testing in CICD pipeline

## Pre-requisite

Deploy load testing solution (https://docs.aws.amazon.com/solutions/latest/distributed-load-testing-on-aws/deployment.html)
Obtain URL for load testing solution (value of the CloudFormation output parameter 'DLTApiEndpointD98B09AC')

## Getting started

Update loadTestEnvVars.json file with the load testing endpoint URL and run the following commands:
- `cdk bootstrap`: This command would provision resources that AWS CDK needs to deploy the stack. Documentation is available [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html).
- `cdk deploy`: Deploys the specified stack
