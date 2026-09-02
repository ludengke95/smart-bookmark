/**
 * 极简 Toast 通知总线
 */
class ToastState {
  message = $state('');
  visible = $state(false);
  timer = null;

  show(msg, duration = 2000) {
    this.message = msg;
    this.visible = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.visible = false;
    }, duration);
  }
}

export const toast = new ToastState();
