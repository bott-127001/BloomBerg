const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class UpstoxRateLimiter {
  constructor() {
    this.lastRequestAt = 0;
    this.requestsInWindow = 0;
    this.windowTimer = null;
    this.active = false;
  }

  startScanCounter() {
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
    }
    this.active = true;
    this.requestsInWindow = 0;
    this.windowTimer = setInterval(() => {
      if (!this.active) return;
      console.log(`Upstox API: ${this.requestsInWindow} requests made in last 60s`);
      this.requestsInWindow = 0;
    }, 60000);
  }

  stopScanCounter() {
    this.active = false;
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
      this.windowTimer = null;
    }
  }

  async waitTurn() {
    const now = Date.now();
    const delta = now - this.lastRequestAt;
    if (delta < 125) {
      await sleep(125 - delta);
    }
    this.lastRequestAt = Date.now();
    this.requestsInWindow += 1;
  }
}

module.exports = { UpstoxRateLimiter, sleep };
