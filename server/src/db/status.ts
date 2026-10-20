let ready = false;

export function setDbReady(value: boolean): void {
  ready = value;
}

export function isDbReady(): boolean {
  return ready;
}
