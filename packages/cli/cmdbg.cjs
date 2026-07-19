const { Command } = require('commander');
const program = new Command();
program
  .command('chat [prompt]', { isDefault: true })
  .option('-k, --key <key>', 'key')
  .option('-p, --provider <provider>', 'provider')
  .option('-m, --model <model>', 'model')
  .option('-v, --verbose', 'verbose')
  .option('--permission <level>', 'perm')
  .option('-i, --interactive', 'interactive', true)
  .action((prompt, options) => {
    console.log('PROMPT=', JSON.stringify(prompt));
    console.log('OPTIONS=', JSON.stringify(options));
  });
program.parse(['node', 'test', '--model', 'openrouter/tencent/hy3:free', 'What is india\'s capital']);
