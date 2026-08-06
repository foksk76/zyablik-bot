'use strict';

// Изоляция env-only тестов от рабочего конфиг-файла стенда
// (config/zyablik.config.json). Тесты, которые передают явный environment
// без ZYABLIK_CONFIG, подхватывают файл из CWD через дефолтный путь
// loadConfig. envWithoutConfig подмешивает ZYABLIK_CONFIG на несуществующий
// путь, возвращая тест в env-only режим (обратная совместимость ADR-0045).

const path = require('node:path');
const os = require('node:os');

const NO_CONFIG_PATH = path.join(os.tmpdir(), 'zyablik-tests-no-config.json');

function envWithoutConfig(environment = {}) {
    return { ...environment, ZYABLIK_CONFIG: NO_CONFIG_PATH };
}

module.exports = { envWithoutConfig, NO_CONFIG_PATH };
