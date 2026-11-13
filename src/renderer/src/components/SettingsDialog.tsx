import { useEffect, useState } from 'react'
import { Bot, Code2, Info, Settings, X } from 'lucide-react'
import type { AppPreferences } from '@shared/preferences'

type SettingsSection = 'general' | 'editor' | 'ai' | 'about'

interface SettingsDialogProps {
  preferences: AppPreferences
  onPreferencesChange(preferences: AppPreferences): void
  onOpenAiSettings(): void
  onClose(): void
}

const sections: { id: SettingsSection; label: string; icon: typeof Settings }[] = [
  { id: 'general', label: 'Genel', icon: Settings },
  { id: 'editor', label: 'Düzenleyici', icon: Code2 },
  { id: 'ai', label: 'Yapay zekâ', icon: Bot },
  { id: 'about', label: 'Hakkında', icon: Info },
]

export default function SettingsDialog({ preferences, onPreferencesChange, onOpenAiSettings, onClose }: SettingsDialogProps) {
  const [section, setSection] = useState<SettingsSection>('general')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const update = (patch: Partial<AppPreferences>) => onPreferencesChange({ ...preferences, ...patch })

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="settings-header">
          <h2 id="settings-title"><Settings size={17} /> Ayarlar</h2>
          <button className="icon-button small" title="Kapat" onClick={onClose}><X size={15} /></button>
        </header>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Ayar kategorileri">
            {sections.map(({ id, label, icon: Icon }) => (
              <button key={id} className={section === id ? 'active' : ''} onClick={() => setSection(id)}>
                <Icon size={15} />{label}
              </button>
            ))}
          </nav>
          <main className="settings-content">
            {section === 'general' ? (
              <section>
                <h3>Genel</h3>
                <p className="settings-description">CodeTeo’nun temel görünüm ve çalışma tercihleri.</p>
                <div className="settings-row"><div><strong>Arayüz dili</strong><span>Uygulamanın dili Türkçe.</span></div><span className="settings-value">Türkçe</span></div>
                <div className="settings-row"><div><strong>Görünüm</strong><span>Koyu tema, kod üzerinde çalışmak için etkin.</span></div><span className="settings-value">Koyu</span></div>
                <label className="settings-toggle"><span><strong>Değişiklikleri atmadan önce sor</strong><small>Kaydedilmemiş dosyalar varken klasör değiştirirken veya sekmeyi kapatırken onay ister.</small></span><input type="checkbox" checked={preferences.confirmBeforeDiscard} onChange={(event) => update({ confirmBeforeDiscard: event.target.checked })} /></label>
              </section>
            ) : null}
            {section === 'editor' ? (
              <section>
                <h3>Düzenleyici</h3>
                <p className="settings-description">Kod yazma alanını kendi çalışma şekline göre ayarla.</p>
                <label className="settings-row"><span><strong>Yazı boyutu</strong><small>Kod alanındaki metnin boyutu.</small></span><select value={preferences.editorFontSize} onChange={(event) => update({ editorFontSize: Number(event.target.value) as AppPreferences['editorFontSize'] })}>{[12, 13, 14, 16, 18].map((size) => <option key={size} value={size}>{size} piksel</option>)}</select></label>
                <label className="settings-row"><span><strong>Girinti genişliği</strong><small>Tab tuşuyla eklenecek boşluk sayısı.</small></span><select value={preferences.tabSize} onChange={(event) => update({ tabSize: Number(event.target.value) as AppPreferences['tabSize'] })}>{[2, 4, 8].map((size) => <option key={size} value={size}>{size} boşluk</option>)}</select></label>
                <label className="settings-toggle"><span><strong>Uzun satırları kaydır</strong><small>Uzun kod satırlarını yatay kaydırma yerine alt satırda göster.</small></span><input type="checkbox" checked={preferences.wordWrap} onChange={(event) => update({ wordWrap: event.target.checked })} /></label>
                <label className="settings-toggle"><span><strong>Satır numaralarını göster</strong><small>Kod alanının solunda satır numaralarını göster.</small></span><input type="checkbox" checked={preferences.lineNumbers} onChange={(event) => update({ lineNumbers: event.target.checked })} /></label>
              </section>
            ) : null}
            {section === 'ai' ? (
              <section>
                <h3>Yapay zekâ</h3>
                <p className="settings-description">Yeni sohbetlerin varsayılan davranışını seç.</p>
                <label className="settings-row"><span><strong>Varsayılan çalışma modu</strong><small>Ajan dosyaları inceleyebilir; değişiklik ve komutlar için onayın gerekir.</small></span><select value={preferences.defaultAiMode} onChange={(event) => update({ defaultAiMode: event.target.value as AppPreferences['defaultAiMode'] })}><option value="chat">Sohbet</option><option value="agent">Ajan</option></select></label>
                <label className="settings-toggle"><span><strong>Açık dosyayı sohbete ekle</strong><small>İstek gönderirken düzenleyicide açık dosyanın içeriğini sağlayıcıya gönderir.</small></span><input type="checkbox" checked={preferences.includeActiveFile} onChange={(event) => update({ includeActiveFile: event.target.checked })} /></label>
                <div className="settings-action-row"><span><strong>Sağlayıcılar ve API anahtarları</strong><small>Gemini, OpenAI, Kumru ve diğer bağlantıları yönet.</small></span><button className="toolbar-button save-button" onClick={onOpenAiSettings}>Yapay zekâ ayarlarını aç</button></div>
              </section>
            ) : null}
            {section === 'about' ? (
              <section>
                <h3>CodeTeo hakkında</h3>
                <div className="about-brand"><div className="brand-mark"><Code2 size={20} /></div><div><strong>CodeTeo</strong><span>Windows için kod çalışma alanı</span></div></div>
                <p className="settings-description">Dosyalarını düzenle, PowerShell terminalini kullan ve tercih ettiğin yapay zekâ sağlayıcısıyla çalış.</p>
                <div className="settings-row"><div><strong>Çalışma alanı</strong><span>Dosyaların seçtiğin klasörde kalır.</span></div><span className="settings-value">Windows</span></div>
              </section>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  )
}
