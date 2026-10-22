import "@testing-library/jest-dom";

// jsdom no implementa `showModal`/`close` de <dialog>: polyfill mínimo que
// refleja el atributo `open` y el evento `close`, que es lo que observan los
// componentes.
if (
  typeof HTMLDialogElement !== "undefined" &&
  typeof HTMLDialogElement.prototype.showModal !== "function"
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
