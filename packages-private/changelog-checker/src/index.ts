/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as process from 'process';
import * as fs from 'fs';
import { parseChangeLog } from './parser.js';
import { checkNewRelease, checkNewTopic } from './checker.js';

function abort(message?: string) {
	if (message) {
		console.error(message);
	}

	process.exit(1);
}

function main() {
	if (!fs.existsSync('./CHANGELOG_CHERIPIA-base.md') || !fs.existsSync('./CHANGELOG_CHERIPIA-head.md')) {
		abort('CHANGELOG_CHERIPIA-base.md or CHANGELOG_CHERIPIA-head.md is missing.');
		return;
	}

	const base = parseChangeLog('./CHANGELOG_CHERIPIA-base.md');
	const head = parseChangeLog('./CHANGELOG_CHERIPIA-head.md');

	const result = (base.length < head.length)
		? checkNewRelease(base, head)
		: checkNewTopic(base, head);

	if (!result.success) {
		abort(result.message);
		return;
	}
}

main();
