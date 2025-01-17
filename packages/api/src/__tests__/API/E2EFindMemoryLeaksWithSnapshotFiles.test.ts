/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @format
 * @oncall web_perf_infra
 */

/* eslint-disable @typescript-eslint/ban-ts-comment */

import {fileManager} from '@memlab/core';

import path from 'path';
import fs from 'fs-extra';
import {takeSnapshots, findLeaksBySnapshotFilePaths} from '../../index';
import {scenario, testSetup, testTimeout} from './lib/E2ETestSettings';

beforeEach(testSetup);

function injectDetachedDOMElements() {
  // @ts-ignore
  window.injectHookForLink4 = () => {
    class TestObject {
      key: 'value';
    }
    const arr = [];
    for (let i = 0; i < 23; ++i) {
      arr.push(document.createElement('div'));
    }
    // @ts-ignore
    window.__injectedValue = arr;
    // @ts-ignore
    window._path_1 = {x: {y: document.createElement('div')}};
    // @ts-ignore
    window._path_2 = new Set([document.createElement('div')]);
    // @ts-ignore
    window._randomObject = [new TestObject()];
  };
}

test(
  'leak detector can find detached DOM elements',
  async () => {
    const result = await takeSnapshots({
      scenario,
      evalInBrowserAfterInitLoad: injectDetachedDOMElements,
    });
    // copy heap snapshots to a different location
    const snapshotFiles = result.getSnapshotFiles();
    const tmpDir = fileManager.generateTmpHeapDir();
    const newSnapshotFiles: string[] = [];
    snapshotFiles.forEach(file => {
      const newFile = path.join(tmpDir, path.basename(file));
      newSnapshotFiles.push(newFile);
      fs.moveSync(file, newFile);
    });
    fs.rmdirSync(result.getRootDirectory(), {recursive: true});

    // find memory leaks with the new snapshot files
    const leaks = await findLeaksBySnapshotFilePaths(
      newSnapshotFiles[0],
      newSnapshotFiles[1],
      newSnapshotFiles[2],
    );

    // detected all different leak trace cluster
    expect(leaks.length >= 1).toBe(true);
    // expect all traces are found
    expect(
      leaks.some(leak => JSON.stringify(leak).includes('__injectedValue')),
    );
    expect(leaks.some(leak => JSON.stringify(leak).includes('_path_1')));
    expect(leaks.some(leak => JSON.stringify(leak).includes('_path_2')));

    // finally clean up the temporary directory
    fs.rmdirSync(tmpDir, {recursive: true});
  },
  testTimeout,
);
