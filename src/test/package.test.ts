import {
	readManifest, collect, toContentTypes, ReadmeProcessor,
	read, processFiles, createDefaultProcessors,
	toVsixManifest, IFile, validateManifest
} from '../package';
import { Manifest } from '../manifest';
import * as path from 'path';
import * as fs from 'fs';
import * as assert from 'assert';
import { parseString } from 'xml2js';
import * as denodeify from 'denodeify';
import * as util from '../util';
import * as _ from 'lodash';

const readFile = denodeify<string, string, string>(fs.readFile);
const parseXml = denodeify<string,any>(parseString);
const fixture = name => path.join(__dirname, 'fixtures', name);

function _toVsixManifest(manifest: Manifest, files: IFile[]): Promise<string> {
	const processors = createDefaultProcessors(manifest);
	return processFiles(processors, files).then(() => {
		const assets = _.flatten(processors.map(p => p.assets));
		const vsix = (<any> _.assign)({ assets }, ...processors.map(p => p.vsix));

		return toVsixManifest(assets, vsix);
	});
}

describe('collect', () => {

	it('should catch all files', () => {
		const cwd = fixture('uuid');

		return readManifest(cwd)
			.then(manifest => collect(manifest, { cwd }))
			.then(files => {
				assert.equal(files.length, 3);
			});
	});

	it('should ignore .git/**', () => {
		const cwd = fixture('uuid');

		if (!fs.existsSync(path.join(cwd, '.git'))) {
			fs.mkdirSync(path.join(cwd, '.git'));
		}

		if (!fs.existsSync(path.join(cwd, '.git', 'hello'))) {
			fs.writeFileSync(path.join(cwd, '.git', 'hello'), 'world');
		}

		return readManifest(cwd)
			.then(manifest => collect(manifest, { cwd }))
			.then(files => {
				assert.equal(files.length, 3);
			});
	});

	it('should ignore devDependencies', () => {
		const cwd = fixture('devDependencies');

		return readManifest(cwd)
			.then(manifest => collect(manifest, { cwd }))
			.then(files => {
				assert.equal(files.length, 4);
				assert.ok(files.some(f => /real\/dependency\.js/.test(f.path)));
				assert.ok(!files.some(f => /fake\/dependency\.js/.test(f.path)));
			});
	});

	it('should ignore **/.vsixmanifest', () => {
		const cwd = fixture('vsixmanifest');

		return readManifest(cwd)
			.then(manifest => collect(manifest, { cwd }))
			.then(files => {
				assert.equal(files.filter(f => /\.vsixmanifest$/.test(f.path)).length, 1);
			});
	});
});

describe('validateManifest', () => {
	it('should catch missing fields', () => {
		assert(validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: { vscode: '0.10.1' }}));
		assert.throws(() => { validateManifest({ publisher: null, name: 'demo', version: '1.0.0', engines: { vscode: '0.10.1' }}); });
		assert.throws(() => { validateManifest({ publisher: 'demo', name: null, version: '1.0.0', engines: { vscode: '0.10.1' }}); });
		assert.throws(() => { validateManifest({ publisher: 'demo', name: 'demo', version: null, engines: { vscode: '0.10.1' }}); });
		assert.throws(() => { validateManifest({ publisher: 'demo', name: 'demo', version: '1.0', engines: { vscode: '0.10.1' }}); });
		assert.throws(() => { validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: null}); });
		assert.throws(() => { validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: { vscode: null }}); });
	});
});

describe('toVsixManifest', () => {
	it('should produce a good xml', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null)
		};

		return _toVsixManifest(manifest, [])
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result);
				assert.ok(result.PackageManifest);
				assert.ok(result.PackageManifest.$);
				assert.equal(result.PackageManifest.$.Version, '2.0.0');
				assert.equal(result.PackageManifest.$.xmlns, 'http://schemas.microsoft.com/developer/vsx-schema/2011');
				assert.equal(result.PackageManifest.$['xmlns:d'], 'http://schemas.microsoft.com/developer/vsx-schema-design/2011');
				assert.ok(result.PackageManifest.Metadata);
				assert.equal(result.PackageManifest.Metadata.length, 1);
				assert.equal(result.PackageManifest.Metadata[0].Description[0]._, 'test extension');
				assert.equal(result.PackageManifest.Metadata[0].DisplayName[0], 'test');
				assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Id, 'test');
				assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Version, '0.0.1');
				assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Publisher, 'mocha');
				assert.deepEqual(result.PackageManifest.Metadata[0].Tags, ['vscode']);
				assert.deepEqual(result.PackageManifest.Metadata[0].GalleryFlags, ['Public']);
				assert.equal(result.PackageManifest.Installation.length, 1);
				assert.equal(result.PackageManifest.Installation[0].InstallationTarget.length, 1);
				assert.equal(result.PackageManifest.Installation[0].InstallationTarget[0].$.Id, 'Microsoft.VisualStudio.Code');
				assert.deepEqual(result.PackageManifest.Dependencies, ['']);
				assert.equal(result.PackageManifest.Assets.length, 1);
				assert.equal(result.PackageManifest.Assets[0].Asset.length, 1);
				assert.equal(result.PackageManifest.Assets[0].Asset[0].$.Type, 'Microsoft.VisualStudio.Code.Manifest');
				assert.equal(result.PackageManifest.Assets[0].Asset[0].$.Path, 'extension/package.json');
			});
	});

	it('should treat README.md as asset', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null)
		};

		const files = [
			{ path: 'extension/readme.md' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
				assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.Details');
				assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/readme.md');
			});
	});

	it('should respect display name', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			displayName: 'Test Extension',
			engines: Object.create(null)
		};

		return _toVsixManifest(manifest, [])
			.then(xml => parseXml(xml))
			.then(result => {
				assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Id, 'test');
				assert.equal(result.PackageManifest.Metadata[0].DisplayName[0], 'Test Extension');
			});
	});

	it('should treat any license file as asset', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			license: 'SEE LICENSE IN thelicense.md',
			engines: Object.create(null)
		};

		const files = [
			{ path: 'extension/thelicense.md' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
				assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.License');
				assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/thelicense.md');
			});
	});

	it('should add a license metadata tag', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			license: 'SEE LICENSE IN thelicense.md',
			engines: Object.create(null)
		};

		const files = [
			{ path: 'extension/thelicense.md' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result.PackageManifest.Metadata[0].License);
				assert.equal(result.PackageManifest.Metadata[0].License.length, 1);
				assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
			});
	});

	it('should add an icon metadata tag', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			icon: 'fake.png',
			license: 'SEE LICENSE IN thelicense.md'
		};

		const files = [
			{ path: 'extension/fake.png' },
			{ path: 'extension/thelicense.md' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result.PackageManifest.Metadata[0].Icon);
				assert.equal(result.PackageManifest.Metadata[0].Icon.length, 1);
				assert.equal(result.PackageManifest.Metadata[0].Icon[0], 'extension/fake.png');
				assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
			});
	});

	it('should add an icon asset', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			icon: 'fake.png'
		};

		const files = [
			{ path: 'extension/fake.png' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result.PackageManifest.Assets[0].Asset.some(d => d.$.Type === 'Microsoft.VisualStudio.Services.Icons.Default' && d.$.Path === 'extension/fake.png'));
			});
	});

	it('should add asset with win path', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			icon: 'fake.png',
			license: 'SEE LICENSE IN thelicense.md'
		};

		const files = [
			{ path: 'extension\\fake.png' },
			{ path: 'extension\\thelicense.md' }
		];

		return _toVsixManifest(manifest, files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result.PackageManifest.Metadata[0].Icon);
				assert.equal(result.PackageManifest.Metadata[0].Icon.length, 1);
				assert.equal(result.PackageManifest.Metadata[0].Icon[0], 'extension/fake.png');
				assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
			});
	});

	it('should understand gallery color and theme', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			engines: Object.create(null),
			galleryBanner: {
				color: '#5c2d91',
				theme: 'dark'
			}
		};

		return _toVsixManifest(manifest, [])
			.then(xml => parseXml(xml))
			.then(result => {
				const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Branding.Color' && p.Value === '#5c2d91'));
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Branding.Theme' && p.Value === 'dark'));
			});
	});

	it('should understand all link types', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			engines: Object.create(null),
			repository: {
				type: "git",
				url: "https://github.com/Microsoft/vscode-spell-check.git"
			},
			bugs: {
				url: "https://github.com/Microsoft/vscode-spell-check/issues"
			},
			homepage: "https://github.com/Microsoft/vscode-spell-check",
		};

		return _toVsixManifest(manifest, [])
			.then(xml => parseXml(xml))
			.then(result => {
				const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Source' && p.Value === 'https://github.com/Microsoft/vscode-spell-check.git'));
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Getstarted' && p.Value === 'https://github.com/Microsoft/vscode-spell-check.git'));
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Repository' && p.Value === 'https://github.com/Microsoft/vscode-spell-check.git'));
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Support' && p.Value === 'https://github.com/Microsoft/vscode-spell-check/issues'));
				assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Learn' && p.Value === 'https://github.com/Microsoft/vscode-spell-check'));
			});
	});

	it('should understand categories', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			engines: Object.create(null),
			categories: ['hello', 'world']
		};

		return _toVsixManifest(manifest, [])
			.then(xml => parseXml(xml))
			.then(result => {
				const categories = result.PackageManifest.Metadata[0].Categories[0].split(',');
				assert.ok(categories.some(c => c === 'hello'));
				assert.ok(categories.some(c => c === 'world'));
			});
	});
});

describe('toContentTypes', () => {
	it('should produce a good xml', () => {
		return toContentTypes([])
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result);
				assert.ok(result.Types);
				assert.ok(result.Types.Default);
				assert.equal(result.Types.Default.length, 2);
				assert.ok(result.Types.Default.some(d => d.$.Extension === '.vsixmanifest' && d.$.ContentType === 'text/xml'));
				assert.ok(result.Types.Default.some(d => d.$.Extension === '.json' && d.$.ContentType === 'application/json'));
			});
	});

	it('should include extra extensions', () => {
		const files = [
			{ path: 'hello.txt' },
			{ path: 'hello.png' },
			{ path: 'hello.md' },
			{ path: 'hello' }
		];

		return toContentTypes(files)
			.then(xml => parseXml(xml))
			.then(result => {
				assert.ok(result.Types.Default);
				assert.ok(result.Types.Default.some(d => d.$.Extension === '.txt' && d.$.ContentType === 'text/plain'));
				assert.ok(result.Types.Default.some(d => d.$.Extension === '.png' && d.$.ContentType === 'image/png'));
				assert.ok(result.Types.Default.some(d => d.$.Extension === '.md' && d.$.ContentType === 'text/x-markdown'));
				assert.ok(!result.Types.Default.some(d => d.$.Extension === ''));
			});
	});
});

describe('ReadmeProcessor', () => {

	it('should be no-op when no baseContentUrl is provided', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null)
		};

		const root = fixture('readme');
		const processor = new ReadmeProcessor(manifest);
		const readme = {
			path: 'extension/readme.md',
			localPath: path.join(root, 'readme.md')
		};

		return processor.onFile(readme)
			.then(file => read(file))
			.then(actualBuffer => {
				const actual = actualBuffer.toString('utf8');

				return readFile(path.join(root, 'readme.md'), 'utf8')
					.then(expected => {
						assert.equal(actual, expected);
					})
			});
	});

	it('should take baseContentUrl', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null)
		};

		const root = fixture('readme');
		const processor = new ReadmeProcessor(manifest, {
			baseContentUrl: 'https://github.com/username/repository/blob/master',
			baseImagesUrl: 'https://github.com/username/repository/raw/master'
		});
		const readme = {
			path: 'extension/readme.md',
			localPath: path.join(root, 'readme.md')
		};

		return processor.onFile(readme)
			.then(file => read(file))
			.then(actualBuffer => {
				const actual = actualBuffer.toString('utf8');

				return readFile(path.join(root, 'readme.expected.md'), 'utf8')
					.then(expected => {
						assert.equal(actual, expected);
					})
			});
	});

	it('should infer baseContentUrl if its a github repo', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			repository: 'https://github.com/username/repository'
		};

		const root = fixture('readme');
		const processor = new ReadmeProcessor(manifest);
		const readme = {
			path: 'extension/readme.md',
			localPath: path.join(root, 'readme.md')
		};

		return processor.onFile(readme)
			.then(file => read(file))
			.then(actualBuffer => {
				const actual = actualBuffer.toString('utf8');

				return readFile(path.join(root, 'readme.expected.md'), 'utf8')
					.then(expected => {
						assert.equal(actual, expected);
					})
			});
	});

	it('should infer baseContentUrl if its a github repo (.git)', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			repository: 'https://github.com/username/repository.git'
		};

		const root = fixture('readme');
		const processor = new ReadmeProcessor(manifest);
		const readme = {
			path: 'extension/readme.md',
			localPath: path.join(root, 'readme.md')
		};

		return processor.onFile(readme)
			.then(file => read(file))
			.then(actualBuffer => {
				const actual = actualBuffer.toString('utf8');

				return readFile(path.join(root, 'readme.expected.md'), 'utf8')
					.then(expected => {
						assert.equal(actual, expected);
					})
			});
	});

	it('should replace img urls with baseImagesUrl', () => {
		const manifest = {
			name: 'test',
			publisher: 'mocha',
			version: '0.0.1',
			description: 'test extension',
			engines: Object.create(null),
			repository: 'https://github.com/username/repository.git'
		};

		const options = {
			baseImagesUrl: 'https://github.com/username/repository/path/to'
		}

		const root = fixture('readme');
		const processor = new ReadmeProcessor(manifest, options);
		const readme = {
			path: 'extension/readme.md',
			localPath: path.join(root, 'readme.md')
		};

		return processor.onFile(readme)
			.then(file => read(file))
			.then(actualBuffer => {
				const actual = actualBuffer.toString('utf8');

				return readFile(path.join(root, 'readme.images.expected.md'), 'utf8')
					.then(expected => {
						assert.equal(actual, expected);
					})
			});
	});
});