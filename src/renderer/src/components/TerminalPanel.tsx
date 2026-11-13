import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  workspacePath: string
  visible: boolean
  onClose(): void
  onRestart(): void
  onError(message: string): void
}

export default function TerminalPanel({ workspacePath, visible, onClose, onRestart, onError }: TerminalPanelProps) {
  const host = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const [status, setStatus] = useState('Starting PowerShell…')
  const [stopped, setStopped] = useState(false)

  useEffect(() => {
    if (visible) requestAnimationFrame(() => terminalRef.current?.focus())
  }, [visible])

  useEffect(() => {
    if (!host.current) return
    let disposed = false
    let terminalId: string | null = null
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'Cascadia Code, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 4000,
      theme: {
        background: '#111318',
        foreground: '#d9dde7',
        cursor: '#8ab4ff',
        selectionBackground: '#29415f',
        black: '#151821',
        red: '#ff7b72',
        green: '#80d890',
        yellow: '#e6c879',
        blue: '#80aaff',
        magenta: '#d2a8ff',
        cyan: '#70d6d0',
        white: '#d9dde7',
        brightBlack: '#697386',
        brightRed: '#ffa198',
        brightGreen: '#9ee6a8',
        brightYellow: '#f0df9a',
        brightBlue: '#a8c4ff',
        brightMagenta: '#e2c2ff',
        brightCyan: '#8be5df',
        brightWhite: '#ffffff',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    terminalRef.current = terminal
    const resize = () => {
      if (disposed || !host.current?.clientWidth || !host.current.clientHeight) return
      try {
        fit.fit()
        if (terminalId) void window.desktop.resizeTerminal(terminalId, terminal.cols, terminal.rows)
      } catch {
        // A hidden terminal can report a zero-sized viewport while the panel is closing.
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    const removeOutput = window.desktop.onTerminalOutput((output) => {
      if (output.terminalId === terminalId) terminal.write(output.data)
    })
    const removeExit = window.desktop.onTerminalExit((exit) => {
      if (exit.terminalId !== terminalId) return
      terminal.write(`\r\n\x1b[90m[PowerShell exited with code ${exit.exitCode}]\x1b[0m\r\n`)
      setStatus('PowerShell stopped')
      setStopped(true)
    })
    const input = terminal.onData((data) => {
      if (terminalId) void window.desktop.writeTerminal(terminalId, data)
    })

    const start = async () => {
      try {
        resize()
        const id = await window.desktop.createTerminal(terminal.cols || 100, terminal.rows || 24)
        if (disposed) {
          void window.desktop.closeTerminal(id)
          return
        }
        terminalId = id
        setStatus(`PowerShell · ${workspacePath}`)
        resize()
        terminal.focus()
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Could not start PowerShell.'
        setStatus('Terminal unavailable')
        setStopped(true)
        onError(message)
        terminal.write(`\x1b[31m${message}\x1b[0m\r\n`)
      }
    }
    void start()

    return () => {
      disposed = true
      observer.disconnect()
      removeOutput()
      removeExit()
      input.dispose()
      if (terminalId) void window.desktop.closeTerminal(terminalId)
      terminalRef.current = null
      terminal.dispose()
    }
  }, [workspacePath, onError])

  return (
    <section className={`terminal-panel ${visible ? '' : 'hidden'}`}>
      <div className="terminal-toolbar">
        <span className="terminal-label"><span className={`terminal-dot ${stopped ? 'stopped' : ''}`} />{status}</span>
        <div className="terminal-actions">
          <button className="terminal-restart" title="Start a new PowerShell session" onClick={onRestart}>Restart</button>
          <button className="icon-button small" title="Hide terminal (session keeps running)" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="terminal-host" ref={host} />
    </section>
  )
}
