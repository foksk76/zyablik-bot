// SPDX-License-Identifier: Apache-2.0
'use strict';

// Общий base64url encoder для auth-модулей queue-monitor.
// Раньше дублировался в session.js и oidc.js (PR #16 review W4).
// Только encode — decode в session.js остаётся локальным (нужен только там).

function base64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

module.exports = {
    base64url
};
