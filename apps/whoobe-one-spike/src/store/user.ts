// Pinia port of whoobe-one-studio's store/modules/user.js - near-empty even
// in the original (no login/auth exists in this client-only app; `socket`
// defaults true but nothing in the surveyed codebase actually uses
// socket.io - see the port plan §3). Ported for completeness/state-layer
// parity, not because anything consumes it yet.
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const login = ref<boolean>(false)
  const user = ref<Record<string, any>>({})
  const popup = ref<boolean>(false)
  const intro = ref<number>(1)
  const socket = ref<boolean>(true)

  function setLogin(v: boolean) { login.value = v }
  function setUser(v: Record<string, any>) { user.value = v }
  function setPopup(v: boolean) { popup.value = v }
  function setIntro(v: number) { intro.value = v }
  function setSocket(v: boolean) { socket.value = v }

  return { login, user, popup, intro, socket, setLogin, setUser, setPopup, setIntro, setSocket }
})
