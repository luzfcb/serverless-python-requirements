const crossSpawn = require('cross-spawn');
const deasync = require('deasync-promise');
const glob = require('glob-all');
const JSZip = require('jszip');
const tape = require('tape');
const { removeSync, readFileSync } = require('fs-extra');
const { sep } = require('path');

const { getUserCachePath } = require('./lib/shared');

const initialWorkingDir = process.cwd();

const mkCommand = cmd => (args, options = {}) => {
  const { error, stdout, stderr, status } = crossSpawn.sync(
    cmd,
    args,
    Object.assign(
      {
        env: Object.assign(
          process.env,
          { SLS_DEBUG: 't' },
          process.env.CI ? { LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } : {}
        )
      },
      options
    )
  );
  if (error) throw error;
  if (status) {
    console.error(stdout.toString()); // eslint-disable-line no-console
    console.error(stderr.toString()); // eslint-disable-line no-console
    throw new Error(`${cmd} failed with status code ${status}`);
  }
  return stdout && stdout.toString().trim();
};
const sls = mkCommand('sls');
const git = mkCommand('git');
const npm = mkCommand('npm');

const setup = () => {
  removeSync(getUserCachePath());
};

const teardown = () => {
  [
    'puck',
    'puck2',
    'puck3',
    'node_modules',
    '.serverless',
    '.requirements.zip',
    '.requirements-cache',
    'foobar',
    'package-lock.json',
    'slimPatterns.yml',
    'serverless.yml.bak',
    getUserCachePath(),
    ...glob.sync('serverless-python-requirements-*.tgz')
  ].map(path => removeSync(path));
  git(['checkout', 'serverless.yml']);
  process.chdir(initialWorkingDir);
  removeSync('tests/base with a space');
};

const test = (desc, func) =>
  tape.test(desc, t => {
    setup();
    try {
      func(t);
    } finally {
      teardown();
    }
  });

const getPythonBin = (version = 3) => {
  if (![2, 3].includes(version)) throw new Error('version must be 2 or 3');
  if (process.platform === 'win32')
    return `c:/python${version === 2 ? '27' : '36'}-x64/python.exe`;
  else return version === 2 ? 'python2.7' : 'python3.6';
};

const listZipFiles = filename =>
  Object.keys(deasync(new JSZip().loadAsync(readFileSync(filename))).files);

test('default pythonBin can package flask with default options', t => {
  process.chdir('tests/base');
  const path = npm(['pack', '../..']);
  npm(['i', path]);
  sls(['package']);
  const zipfiles = listZipFiles('.serverless/sls-py-req-test.zip');
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged');
  t.end();
});

test('py3.6 can package flask with default options', t => {
  process.chdir('tests/base');
  const path = npm(['pack', '../..']);
  npm(['i', path]);
  sls([`--pythonBin=${getPythonBin(3)}`, 'package']);
  const zipfiles = listZipFiles('.serverless/sls-py-req-test.zip');
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged');
  t.end();
});

test('py3.6 can package flask with zip option', t => {
  process.chdir('tests/base');
  const path = npm(['pack', '../..']);
  npm(['i', path]);
  sls([`--pythonBin=${getPythonBin(3)}`, '--zip=true', 'package']);
  const zipfiles = listZipFiles('.serverless/sls-py-req-test.zip');
  t.true(
    zipfiles.includes('.requirements.zip'),
    'zipped requirements are packaged'
  );
  t.true(zipfiles.includes(`unzip_requirements.py`), 'unzip util is packaged');
  t.false(
    zipfiles.includes(`flask${sep}__init__.py`),
    "flask isn't packaged on its own"
  );
  t.end();
});

test('py3.6 can package flask with slim option', t => {
  process.chdir('tests/base');
  const path = npm(['pack', '../..']);
  npm(['i', path]);
  sls([`--pythonBin=${getPythonBin(3)}`, '--slim=true', 'package']);
  const zipfiles = listZipFiles('.serverless/sls-py-req-test.zip');
  t.true(zipfiles.includes(`flask${sep}__init__.py`), 'flask is packaged');
  t.deepEqual(
    zipfiles.filter(filename => filename.endsWith('.pyc')),
    [],
    'no pyc files packaged'
  );
  t.end();
});
