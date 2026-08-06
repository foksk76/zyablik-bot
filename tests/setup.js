'use strict';

// Изоляция тестов от рабочего конфиг-файла стенда (config/zyablik.config.json):
// по умолчанию loadConfig резолвит ./config/zyablik.config.json из CWD, и на
// стенде этот файл существует. Тесты, которые не передают ZYABLIK_CONFIG
// явно, должны работать в env-only режиме, поэтому указываем путь к
// несуществующему файлу.
process.env.ZYABLIK_CONFIG = require('node:path').join(
    require('node:os').tmpdir(),
    'zyablik-tests-no-config.json'
);
