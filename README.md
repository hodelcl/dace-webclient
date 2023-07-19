# SDFV - The SDFG Viewer

[![Build](https://github.com/spcl/dace-webclient/actions/workflows/build.yml/badge.svg)](https://github.com/spcl/dace-webclient/actions/workflows/build.yml)
[![Tests](https://github.com/spcl/dace-webclient/actions/workflows/test.yml/badge.svg)](https://github.com/spcl/dace-webclient/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/spcl/dace-webclient/branch/master/graph/badge.svg?token=K2PCAAUTNU)](https://codecov.io/gh/spcl/dace-webclient)

SDFV is a standalone tool for viewing/embedding SDFGs in your web browser. For more
information on SDFGs, see the [DaCe](https://www.github.com/spcl/dace)
repository.

## Contributing

We welcome any and all contributions. To get started with development on SDFV,
run the following `npm` commands while you edit:

```
npm install
npm run watch
```

Before committing your changes, run `npm install && npm run build-prod` to build
a production bundle. GitHub Actions will fail if the production bundle in your
commit is not up-to-date. If the CI is failing, make sure that you run
`npm install` before building as the dependencies might've changed.
