export const createObservableValue = (initialValue) => {
  // _subscribers = [(value) => void]
  const _subscribers = [];
  let _value = initialValue;

  const subscribeToValue = (callback) => {
    _subscribers.push(callback);
    callback(_value);
  };

  const setValue = (newValue) => {
    _value = newValue;
    _subscribers.forEach((callback) => callback(_value));
  };

  return {
    setValue,
    subscribeToValue,
  };
};
