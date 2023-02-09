import axios from "axios";
import { aws4Interceptor } from "aws4-axios";

const apiEndPoint=process.env.LOAD_TEST_API_ENDPOINT
const appEndPoint=process.env.APP_END_POINT
const timeDelay = 10000; // time in ms between test status checks
const failureThreshold=process.env.FAILURE_THRESHOLD
const avgResponseTimeThreshold=process.env.AVG_RT_THRESHOLD

const interceptor = aws4Interceptor({
    region: "us-east-1",
    service: "execute-api",
});

// Requests made using Axios will now be signed
axios.interceptors.request.use(interceptor);

//function to check test results
async function getTestResult(testId: string) {
    let testStatus: string;
    let response = await axios.get(`${apiEndPoint}scenarios/${testId}`);
    testStatus = response.data.status;
    console.log(`Test status is ${testStatus}`);

    while (testStatus != "complete") {
        console.log(`sleeping for ${timeDelay} ms`);
        await new Promise((f) => setTimeout(f, timeDelay));
        response = await axios.get(`${apiEndPoint}scenarios/${testId}`);
        testStatus = response.data.status;
        console.log(`Test status is: ${response.data.status}`);
    }

    return response.data.results
}

//function to start a test
async function startTest() {
    var payload = require("./startTestPayload.json");
    payload.testScenario.scenarios.sampleScenario.requests[0].url=appEndPoint

    let response = await axios.post(`${apiEndPoint}scenarios/`, payload);
    console.log(`Started test with ID: ${response.data.testId}`);
    return response.data.testId;
}

async function validateTestResults(){
    let testId=await startTest()
    let testResults= await getTestResult(testId)
    let testPassed=true

    if (avgResponseTimeThreshold && testResults.total.avg_rt < avgResponseTimeThreshold){
        console.log(`Avg response time ${testResults.total.avg_rt} is less than the threshold: ${avgResponseTimeThreshold}`)
    }
    else{
        console.log(`Avg response time ${testResults.total.avg_rt} is greater than or equal to the threshold: ${avgResponseTimeThreshold}`)
        testPassed=false
    }

    if (failureThreshold && testResults.total.fail < failureThreshold){
        console.log(`Total failures ${testResults.total.fail} are less than the threshold: ${failureThreshold}`)
    }
    else{
        console.log(`Total failures ${testResults.total.fail} are greater than or equal to the threshold: ${failureThreshold}`)
        testPassed=false
    }

    if(!testPassed) process.exit(1)
}
validateTestResults()
