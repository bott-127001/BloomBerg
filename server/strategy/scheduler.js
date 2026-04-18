const cron = require('node-cron');
const { runScan, runPrewarm, markEOD } = require('./pipeline');

const istOpts = { timezone: 'Asia/Kolkata' };

function initScheduler() {
  console.log('Scheduler initialized. Jobs: prewarm 09:00 IST, scan 09:22 IST, EOD 15:35 IST');
  cron.schedule(
    '0 9 * * 1-5',
    async () => {
      console.log(`Cron fired: prewarm at ${new Date().toISOString()}`);
      await runPrewarm();
    },
    istOpts
  );

  cron.schedule(
    '22 9 * * 1-5',
    async () => {
      console.log(`Cron fired: scan at ${new Date().toISOString()}`);
      await runScan();
    },
    istOpts
  );

  cron.schedule(
    '35 15 * * 1-5',
    async () => {
      console.log(`Cron fired: eod at ${new Date().toISOString()}`);
      await markEOD();
    },
    istOpts
  );
}

module.exports = { initScheduler };
