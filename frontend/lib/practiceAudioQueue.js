// Preserve successive spoken attempts and their evidence order, including retries
// after an earlier provider failure. Each job captures its target before queuing.
export class PracticeAudioQueue {
  constructor() { this.latest = null; }
  enqueue(job) {
    const task = (this.latest || Promise.resolve()).catch(() => {}).then(job);
    this.latest = task;
    // The tool may not ask for the result before a network failure occurs.
    void task.catch(() => {});
    return task;
  }
  async drain() { await this.latest; }
}
