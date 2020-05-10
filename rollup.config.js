import builtins from 'rollup-plugin-node-builtins';
import globals from 'rollup-plugin-node-globals';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'bundle.js',
    format: 'cjs',
  },
  plugins: [
    resolve(),
    commonjs({
      ignore: ['supports-color'],
    }),
    globals(),
    builtins(),
  ],
};
