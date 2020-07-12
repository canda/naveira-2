type Callback<T> = (value: T) => void;
export type Observable<T> = {
  getValue: () => T;
  readonly value: T;
  setValue: (value: T) => void;
  subscribeToValue: (callback: Callback<T>) => void;
};

export const createObservableValue = <T>(initialValue?: T): Observable<T> => {
  const _subscribers: Callback<T>[] = [];
  let _value = initialValue;

  const subscribeToValue = (callback: Callback<T>) => {
    _subscribers.push(callback);
    callback(_value);
  };

  const getValue = () => _value;

  const setValue = (newValue: T) => {
    _value = newValue;
    _subscribers.forEach((callback) => callback(_value));
  };

  return {
    get value() {
      return _value;
    },
    getValue,
    setValue,
    subscribeToValue,
  };
};
