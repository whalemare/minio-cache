# minio-cache

This action allows to cache your dependencies stored in Minio (or other S3 compatible source).

Self-hosted runners supported

## Usage

1. Instal and run https://min.io server

2. Create `.github/workflows/my-cachable-workflow.yml` file

```yaml
name: yarn cache

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]
  workflow_dispatch:

jobs:
  dependencies:
    runs-on: [self-hosted]
    steps:
      - uses: actions/checkout@v2

      - name: Restore yarn cache
        id: cache
        uses: whalemare/minio-cache
        with:
          endpoint: "192.168.1.63" # optional, default s3.amazonaws.com
          port: 9000 # minio port
          insecure: true # optional, use http instead of https. default false
          accessKey: "minioadmin" # required
          secretKey: "minioadmin" # required
          bucket: "bucket-name" # required
          key: ${{ runner.os }}-yarn-${{ hashFiles('**/yarn.lock') }}
          path: |
            node_modules
            ~/node_modules

      - name: Yarn install
        if: steps.cache.outputs.cache-hit != 'true'
        run: yarn install

      - name: Check that dependency installed
        run: yarn ts-jest -v
```
