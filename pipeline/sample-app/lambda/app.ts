const AWS = require('aws-sdk');
const db = new AWS.DynamoDB.DocumentClient();
const tableName = process.env.TABLE_NAME || '';
const primaryKey = process.env.PRIMARY_KEY || '';
const responseDelay = 500 // time delay in ms to add to the response

function sleep(ms:number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const handler = async () : Promise <any> => {
    console.log(`Table: ${tableName}. Primary key: ${primaryKey}`)
    const params = {
        TableName: tableName,
        Item: {
            [primaryKey]: Math.floor(Date.now()).toString(),
            app: 'serverless',
            purpose: 'blog'
        }
    }

    try {
        await db.put(params).promise();
        console.log('Added item to DynamoDB')
        const response = await db.scan(params).promise();
        await sleep(responseDelay)
        return { statusCode: 200, body: JSON.stringify(response.Items) }
    } catch (dbError) {
        return { statusCode: 500, body: JSON.stringify(dbError) }
    }
}