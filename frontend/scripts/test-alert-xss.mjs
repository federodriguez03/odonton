import assert from 'node:assert/strict';

const created = [];
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.className = '';
    this.classList = { add: (...names) => { this.className += ` ${names.join(' ')}`; } };
    created.push(this);
  }
  setAttribute(name, value) { this[name] = value; }
  append(...children) { this.children.push(...children); }
}

const container = new FakeElement('div');
container.replaceChildren = (...children) => { container.children = children; };
globalThis.document = {
  querySelector: (selector) => selector === '#test-alert' ? container : null,
  createElement: (tagName) => new FakeElement(tagName),
};
globalThis.window = { setTimeout: () => 1 };

const { renderAlert } = await import('../src/js/components/alerts.js');
const payload = '<img src=x onerror="globalThis.__xss=1"><script>globalThis.__xss=1</script>';
renderAlert(container, payload, 'danger');

const alert = container.children[0];
const message = alert.children.find((child) => child.className.includes('alert-message'));
assert.equal(message.textContent, payload);
assert.equal(created.some((element) => ['IMG', 'SCRIPT'].includes(element.tagName)), false);
assert.equal(globalThis.__xss, undefined);
console.log('OK alertas: HTML dinamico mostrado como texto');
