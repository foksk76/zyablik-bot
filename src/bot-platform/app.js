#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { createCore, runMaxIdentityDryRun } = require('./core');
const { createMaxTransport } = require('./transports/max');
const { createIdentityPlugin } = require('./plugins/identity');

function createBotPlatformApp(environment = process.env) {
  const core = createCore(environment);
  const transportMode = core.config.maxTransportMode;

  return {
    name: 'max-identity-bot-platform',
    status: 'scaffold',
    core,
    transports: {
      max: createMaxTransport({ transportMode })
    },
    plugins: {
      identity: createIdentityPlugin()
    },
    pipeline: {
      dryRun: 'available',
      transportMode
    }
  };
}

function runBotPlatformDryRun(fixturePath) {
  if (typeof fixturePath !== 'string' || fixturePath.length === 0) {
    throw new Error('Fixture path is required');
  }

  const resolvedPath = path.resolve(process.cwd(), fixturePath);
  const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  return runMaxIdentityDryRun(payload);
}

function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  if (argv.length !== 1) {
    io.stderr.write('Usage: node src/bot-platform/app.js <fixture-path>\n');
    return 1;
  }

  try {
    const result = runBotPlatformDryRun(argv[0]);
    io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  createBotPlatformApp,
  runMaxIdentityDryRun,
  runBotPlatformDryRun,
  main
};
