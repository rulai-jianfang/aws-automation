/**
 * Enable all ApiGateway Apis logging to CloudWatch
 * After enabling logging, log level will be INFO
 */

const AWS = require('aws-sdk');
const wait = require('./util/wait');
const cli = require('cli');
const awsConfigHelper = require('./util/awsConfigHelper');

const cliArgs = cli.parse({
    profile: ['p', 'AWS profile name', 'string', 'default'],
    region: ['r', 'AWS region', 'string']
});

if (!cliArgs.profile || !cliArgs.region) {
    cli.getUsage();
}

awsConfigHelper.updateConfig(cliArgs.profile, cliArgs.region);

const ApiGateway = new AWS.APIGateway();

function isEmpty(obj) {
    for (let prop in obj) {
        if (obj.hasOwnProperty(prop))
            return false;
    }
    return JSON.stringify(obj) === JSON.stringify({});
}

// Deploy api to stage
function createDeployment(restApiId, stageName) {
    var params = {
        restApiId, /* required */
        stageName
    };
    return ApiGateway.createDeployment(params).promise();
}

function updateStage(restApiId, stageName) {
    const params = {
        restApiId, /* required */
        stageName, /* required */
        patchOperations: [
            {
                op: 'replace',
                path: '/*/*/logging/loglevel',
                value: 'INFO'
            }
        ]
    };
    return ApiGateway.updateStage(params).promise();
}

function hasLoggingEnabled(stage) {
    if (isEmpty(stage.methodSettings) || stage.methodSettings['*/*'].loggingLevel === 'OFF') {
        return false;
    }
    return true;
}

// Check log level is INFO or not
function checkLogLevelForINFO(stage) {
    if (!isEmpty(stage.methodSettings) && stage.methodSettings['*/*'].loggingLevel === 'INFO') {
        return true;
    }
    return false;
}

function getRestApis() {
    const params = {
        // limit: 0,
        // position: 'STRING_VALUE'
    };
    return ApiGateway.getRestApis(params).promise();
}

// Get info anout stage resource of api
function getStages(restApiId) {
    const params = {
        restApiId, /* required */
    };
    return ApiGateway.getStages(params).promise();
}

async function enableCloudWatchLogsHandler() {
    try {
        const restApis = await getRestApis();
        console.log('Rest APIs: ', restApis);
        for (let i = 0; i < restApis.items.length; i++) {
            const stages = await getStages(restApis.items[i].id);
            console.log(`Rest API id is ${restApis.items[i].id} and stages: ${JSON.stringify(stages)}`);
            for (let j = 0; j < stages.item.length; j++) {
                const _hasLoggingEnabled = hasLoggingEnabled(stages.item[j]);
                const isLoglevelInfo = checkLogLevelForINFO(stages.item[j]);
                console.log('log enable status: ', _hasLoggingEnabled);
                console.log('Info log level status: ', isLoglevelInfo);
                if (_hasLoggingEnabled && isLoglevelInfo) {
                    continue;
                }
                const restApiId = restApis.items[i].id;
                const stageName = stages.item[j].stageName;
                console.log(`logging enabling starting for restapi id: ${restApiId} and stage: ${stageName}`);
                const isLogggingEnabled = await updateStage(restApiId, stageName);
                console.log('Log enabled response: ', JSON.stringify(isLogggingEnabled));
                const deployedApi = await createDeployment(restApiId, stageName);
                console.log('Deployed api response: ', deployedApi);
                await wait(10000); // Wait because AWS supports 1 request every 5 seconds per account for createDeployment api call
            }
        }
    } catch (err) {
        console.log(err);
    }
}

enableCloudWatchLogsHandler();