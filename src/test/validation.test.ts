import * as assert from 'assert';
import { validatePublisher, validateExtensionName, validateVersion } from '../validation';

describe('validatePublisher', () => {
	it('should throw with empty', () => {
		assert.throws(() => validatePublisher(null));
		assert.throws(() => validatePublisher(void 0));
		assert.throws(() => validatePublisher(''));
	});

	it('should validate', () => {
		validatePublisher('hello');
		validatePublisher('Hello');
		validatePublisher('HelloWorld');
		validatePublisher('Hello-World');
		validatePublisher('Hell0-World');

		assert.throws(() => validatePublisher('hello.'));
		assert.throws(() => validatePublisher('.hello'));
		assert.throws(() => validatePublisher('h ello'));
		assert.throws(() => validatePublisher('hello world'));
		assert.throws(() => validatePublisher('-hello'));
		assert.throws(() => validatePublisher('-'));
	});
});

describe('validateExtensionName', () => {
	it('should throw with empty', () => {
		assert.throws(() => validateExtensionName(null));
		assert.throws(() => validateExtensionName(void 0));
		assert.throws(() => validateExtensionName(''));
	});

	it('should validate', () => {
		validateExtensionName('hello');
		validateExtensionName('Hello');
		validateExtensionName('HelloWorld');
		validateExtensionName('Hello-World');
		validateExtensionName('Hell0-World');

		assert.throws(() => validateExtensionName('hello.'));
		assert.throws(() => validateExtensionName('.hello'));
		assert.throws(() => validateExtensionName('h ello'));
		assert.throws(() => validateExtensionName('hello world'));
		assert.throws(() => validateExtensionName('-hello'));
		assert.throws(() => validateExtensionName('-'));
	});
});

describe('validateVersion', () => {
	it('should throw with empty', () => {
		assert.throws(() => validateVersion(null));
		assert.throws(() => validateVersion(void 0));
		assert.throws(() => validateVersion(''));
	});

	it('should validate', () => {
		validateVersion('1.0.0');
		validateVersion('0.1.1');
		validateVersion('0.1.1-pre');

		assert.throws(() => validateVersion('.'));
		assert.throws(() => validateVersion('..'));
		assert.throws(() => validateVersion('0'));
		assert.throws(() => validateVersion('0.1'));
		assert.throws(() => validateVersion('.0.1'));
		assert.throws(() => validateVersion('0.1.'));
		assert.throws(() => validateVersion('0.0.0.1'));
	});
});