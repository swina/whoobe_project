// Copy buttons: <button data-copy="<id of the element whose text is copied>">
document.querySelectorAll('button[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy)
    if (!source || !navigator.clipboard) return
    const label = button.textContent
    try {
      await navigator.clipboard.writeText(source.textContent.trim())
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy'
    }
    setTimeout(() => { button.textContent = label }, 1500)
  })
})
