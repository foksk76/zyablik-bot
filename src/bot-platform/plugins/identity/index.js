'use strict';

const { handleIdentityEvent } = require('./handler');
const { formatIdentityResponse } = require('./formatter');

module.exports = {
  name: 'identity',
  routes: {
    identity: handleIdentityEvent
  },
  formatIdentityResponse,
  handleIdentityEvent
};
