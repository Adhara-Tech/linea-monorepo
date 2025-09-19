# End to end tests
## Setup
Run `pnpm install` to setup typechain

Run `make start-env-with-tracing-v2-ci` from root directory to spin up local environment


## Run tests
| ENV   | Command                                       | Description                                                          |
|-------|-----------------------------------------------|----------------------------------------------------------------------|
| Local | `pnpm run test:e2e:local`                     | Uses already running docker environment and deployed smart contracts |
| Local | `pnpm run test:e2e:local -t "test suite"`     | Runs a test suite                                                    |
| Local | `pnpm run test:e2e:local -t "specific test"`  | Runs a single test                                                   |
| DEV   | `pnpm run test:e2e:dev`                       | Uses DEV env, may need to update constants in `constants.dev.ts`     |
| UAT   | `pnpm run test:e2e:uat`                       | Uses UAT env, may need to update constants in `constants.uat.ts`     |

## Remote workflows
Workflow options:
- `e2e-tests-with-ssh` - Enable to run `Setup upterm session` step, manually ssh into the github actions workflow using
the steps output, can be used to debug containers.
  - The step will output a string used to connect to the workflow.
  - Example: `ssh XTpun7OCRZMgaCZkiHqU:MWNlNmQ0OGEudm0udXB0ZXJtLmludGVybmFsOjIyMjI=@uptermd.upterm.dev`
  - After connecting create a new file called `continue` in the root directory: `touch continue`
- `e2e-tests-logs-dump` - Enable to print logs after e2e tests have ran


## Debugging test in vscode
Install the `vscode-jest` plugin and open `linea-monorepo/e2e/` directory. Use the following config in `linea-monorepo/e2e/.vscode/settings.json`
```
{
  "jest.autoRun": { "watch": false },
  "jest.jestCommandLine": "pnpm run test:e2e:vscode --",
}
```
and the following config in `linea-monorepo/e2e/.vscode/launch.json`
```
{
    "configurations": [
        {
            "type": "node",
            "name": "vscode-jest-tests.v2",
            "request": "launch",
            "program": "${workspaceFolder}/node_modules/.bin/jest",
            "args": [
                "--config",
                "./jest.vscode.config.js",
                "--detectOpenHandles",
                "--runInBand",
                "--watchAll=false",
                "--testNamePattern",
                "${jest.testNamePattern}",
                "--runTestsByPath",
                "${jest.testFile}"
            ],
            "cwd": "${workspaceFolder}",
            "console": "integratedTerminal",
            "internalConsoleOptions": "neverOpen",
            "disableOptimisticBPs": true,
            "windows": {
                "program": "${workspaceFolder}/node_modules/jest/bin/jest"
            }
        }

    ]
}
```
Now you should be able to run and debug individual tests from the `Testing` explorer tab.


---

```
docker stop $(docker ps -a -q) && docker rm $(docker ps -a -q)
sudo make clean-environment
make start-env-with-tracing-v2-ci
```

```
ts-node local-test.ts 

TEST_ENV=local npx jest -t "Shomei Linea get proof test suite"
```


```
Pallas:~$ docker logs postman 2>&1 | grep -i "WARN"
time=2025-09-10T08:38:43.693Z level=WARN message=DatabaseCleaningPoller is disabled | class=DatabaseCleaningPoller 
Pallas:~$ docker logs postman 2>&1 | grep -i "ERROR

time=2025-09-10T08:40:06,689Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":1149,"error":{"code":-32000,"message":"Known transaction"}} | logger=finalization thread=pool-2-thread-10 | 
time=2025-09-10T08:40:06,693Z level=DEBUG message=eth_sendRawTransaction for aggregation finalization failed: aggregation=[1..2]2 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationSubmitterImpl thread=pool-2-thread-10 | 
time=2025-09-10T08:40:06,695Z level=DEBUG message=Error from aggregation finalization: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationFinalizationCoordinator thread=pool-2-thread-10 | 
time=2025-09-10T08:40:25,800Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":1516,"error":{"code":-32000,"message":"Known transaction"}} | logger=data-submission thread=pool-2-thread-1 | 
time=2025-09-10T08:40:25,800Z level=DEBUG message=eth_sendRawTransaction for blob submission failed: blob=[[3..4]2]1 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmitterAsEIP4844MultipleBlobsPerTx thread=pool-2-thread-1 | 
time=2025-09-10T08:40:25,801Z level=DEBUG message=Error from blob submission: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmissionCoordinator thread=pool-2-thread-1 | 
time=2025-09-10T08:40:27,806Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":1560,"error":{"code":-32000,"message":"Known transaction"}} | logger=finalization thread=pool-2-thread-1 | 
time=2025-09-10T08:40:27,806Z level=DEBUG message=eth_sendRawTransaction for aggregation finalization failed: aggregation=[3..4]2 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationSubmitterImpl thread=pool-2-thread-1 | 
time=2025-09-10T08:43:05,824Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":4366,"error":{"code":-32000,"message":"Known transaction"}} | logger=data-submission thread=pool-2-thread-13 | 
time=2025-09-10T08:43:05,824Z level=DEBUG message=eth_sendRawTransaction for blob submission failed: blob=[[7..8]2]1 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmitterAsEIP4844MultipleBlobsPerTx thread=pool-2-thread-13 | 
time=2025-09-10T08:43:05,824Z level=DEBUG message=Error from blob submission: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmissionCoordinator thread=pool-2-thread-13 | 
time=2025-09-10T08:44:38,689Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":6049,"error":{"code":-32000,"message":"Known transaction"}} | logger=finalization thread=pool-2-thread-13 | 
time=2025-09-10T08:44:38,689Z level=DEBUG message=eth_sendRawTransaction for aggregation finalization failed: aggregation=[10..11]2 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationSubmitterImpl thread=pool-2-thread-13 | 
time=2025-09-10T08:44:38,689Z level=DEBUG message=Error from aggregation finalization: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationFinalizationCoordinator thread=pool-2-thread-13 | 
time=2025-09-10T08:45:13,853Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":6681,"error":{"code":-32000,"message":"Known transaction"}} | logger=data-submission thread=pool-2-thread-11 | 
time=2025-09-10T08:45:13,854Z level=DEBUG message=eth_sendRawTransaction for blob submission failed: blob=[[12..13]2]1 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmitterAsEIP4844MultipleBlobsPerTx thread=pool-2-thread-11 | 
time=2025-09-10T08:45:13,854Z level=DEBUG message=Error from blob submission: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=BlobSubmissionCoordinator thread=pool-2-thread-11 | 
time=2025-09-10T08:45:15,811Z level=DEBUG message=<-- http://l1-el-node:8545/ 200 {"jsonrpc":"2.0","id":6720,"error":{"code":-32000,"message":"Known transaction"}} | logger=finalization thread=pool-2-thread-15 | 
time=2025-09-10T08:45:15,811Z level=DEBUG message=eth_sendRawTransaction for aggregation finalization failed: aggregation=[12..13]2 errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationSubmitterImpl thread=pool-2-thread-15 | 
time=2025-09-10T08:45:15,811Z level=DEBUG message=Error from aggregation finalization: errorMessage=linea.error.JsonRpcErrorResponseException: eth_sendRawTransaction failed with JsonRpcError: code=-32000 message=Known transaction errorData=null | logger=AggregationFinalizationCoordinator thread=pool-2-thread-15 | 

```
