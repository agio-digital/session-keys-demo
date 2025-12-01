export const until = (
  condition: () => boolean | Promise<boolean>,
  options:
    | number
    | {
        interval?: number;
        timeout?: number;
        throwOnTimeout?: boolean;
      } = {
    interval: 50,
    timeout: Infinity,
    throwOnTimeout: false,
  }
) => {
  const opts =
    typeof options === "number"
      ? { interval: 50, timeout: options, throwOnTimeout: false }
      : options;
  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    const checkCondition = async () => {
      try {
        const result = await condition();
        if (result) {
          resolve();
        } else if (Date.now() - startTime >= (opts.timeout ?? Infinity)) {
          if (opts.throwOnTimeout) {
            reject(new Error("until: timeout exceeded"));
          } else {
            resolve();
          }
        } else {
          setTimeout(checkCondition, opts.interval ?? 50);
        }
      } catch (err) {
        reject(err);
      }
    };

    checkCondition();
  });
};
