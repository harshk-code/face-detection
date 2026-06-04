const fs = require('fs');
const path = require('path');

const packageRoot = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-fast-tflite',
);
const specDir = path.join(packageRoot, 'spec');
const runtimeSpecFile = path.join(specDir, 'NativeRNTflite.js');
const codegenSpecFile = path.join(specDir, 'NativeRNTflite.ts');

if (fs.existsSync(packageRoot)) {
  fs.mkdirSync(specDir, {recursive: true});
  fs.writeFileSync(
    runtimeSpecFile,
    [
      "'use strict';",
      '',
      "import { TurboModuleRegistry } from 'react-native';",
      '',
      "export default TurboModuleRegistry.getEnforcing('Tflite');",
      '',
    ].join('\n'),
  );
  fs.writeFileSync(
    codegenSpecFile,
    [
      "import type { TurboModule } from 'react-native';",
      "import { TurboModuleRegistry } from 'react-native';",
      '',
      'export interface Spec extends TurboModule {',
      '  install(): boolean;',
      '}',
      '',
      "export default TurboModuleRegistry.getEnforcing<Spec>('Tflite');",
      '',
    ].join('\n'),
  );
}
