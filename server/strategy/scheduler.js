const cron = require('node-cron');
const { runScanPhase1, runScanPhase2, runPrewarm, markEOD } = require('./pipeline');

const istOpts = { timezone: 'Asia/Kolkata' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function initScheduler() {
  console.log('Scheduler initialized. Jobs: prewarm 09:00:20, phase1 09:21:20, phase2 09:26:20, EOD 15:35:20 — all IST');
  cron.schedule(
    '0 9 * * 1-5',
    async () => {
      await sleep(20000);
      console.log(`Cron fired: prewarm at ${new Date().toISOString()}`);
      await runPrewarm();
    },
    istOpts
  );

  cron.schedule(
    '21 9 * * 1-5',
    async () => {
      await sleep(20000);
      console.log(`Cron fired: scan phase1 at ${new Date().toISOString()}`);
      await runScanPhase1();
    },
    istOpts
  );

  cron.schedule(
    '26 9 * * 1-5',
    async () => {
      await sleep(20000);
      console.log(`Cron fired: scan phase2 at ${new Date().toISOString()}`);
      await runScanPhase2();
    },
    istOpts
  );

  cron.schedule(
    '35 15 * * 1-5',
    async () => {
      await sleep(20000);
      console.log(`Cron fired: eod at ${new Date().toISOString()}`);
      await markEOD();
    },
    istOpts
  );
}

module.exports = { initScheduler };
