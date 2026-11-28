// Opens the registration card's PDF in the browser's print dialog (spec: "Print registration card",
// printing skill). The PDF comes from a 5-minute link; it loads in a hidden frame on this page and
// prints from there. If the browser won't print a PDF from a frame, it opens in a new tab instead.
export function printPdf(url: string) {
  const frame = document.createElement('iframe')
  frame.title = 'Registration card'
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.src = url
  frame.onload = () => {
    try {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
    } catch {
      window.open(url, '_blank', 'noopener')
    }
    // The dialog has the document by now; the frame goes once it's closed.
    setTimeout(() => frame.remove(), 60_000)
  }
  document.body.append(frame)
}

const PRINT_KEY = 'vento.printCard'

// The checkbox under Check in, remembered per device (on by default).
export function printPreferred(): boolean {
  try {
    return localStorage.getItem(PRINT_KEY) !== 'off'
  } catch {
    return true
  }
}

export function rememberPrint(on: boolean) {
  try {
    localStorage.setItem(PRINT_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked: on again next time.
  }
}
