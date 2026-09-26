// @sparticuz/chromium распаковывает системные библиотеки (libnss3 и др.), только если
// видит AWS Lambda на Node 20/22. На Vercel этой переменной нет, хотя сервер тот же
// (Amazon Linux 2023), — подсказываем пакету. Импортировать до @sparticuz/chromium.
process.env.AWS_LAMBDA_JS_RUNTIME ||= "nodejs22.x";
