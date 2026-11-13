export function localizeError(cause: unknown, fallback = 'Beklenmeyen bir hata oluştu.'): string {
  let message = typeof cause === 'string' ? cause : cause instanceof Error ? cause.message : fallback
  message = message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '').trim()

  const status = message.match(/^(.+?) returned HTTP (\d+)(?::.*)?\.?/i)
  if (status) {
    const provider = status[1]
    const code = Number(status[2])
    if (code === 503 || code === 502 || code === 504) return `${provider} şu anda yanıt veremiyor (HTTP ${code}). Birkaç dakika bekleyip yeniden dene.`
    if (code === 429) return `${provider} istek sınırına veya kullanım kotasına ulaştı (HTTP 429). Biraz bekle ya da sağlayıcı hesabındaki kotayı kontrol et.`
    if (code === 401 || code === 403) return `${provider} API anahtarını kabul etmedi (HTTP ${code}). Anahtarı Yapay zekâ ayarlarından kontrol et.`
    if (code === 404) return `${provider} seçili modeli bulamadı (HTTP 404). Model listesini yenileyip kullanılabilir başka bir model seç.`
    if (code === 400) return `${provider} isteği kabul etmedi (HTTP 400). Sohbet modunu, model desteğini ve istek boyutunu kontrol et.`
    return `${provider} isteği HTTP ${code} hatasıyla sonuçlandı. Modeli veya API sağlayıcısını kontrol et.`
  }

  const known: Record<string, string> = {
    'The request failed.': 'İstek başarısız oldu.',
    'Could not load models.': 'Modeller yüklenemedi.',
    'Could not read AI provider settings.': 'Yapay zekâ sağlayıcı ayarları okunamadı.',
    'Could not start PowerShell.': 'PowerShell başlatılamadı.',
    'The local Kumru server did not respond in time.': 'Kumru yerel sunucusu zamanında yanıt vermedi. Sunucunun çalıştığını kontrol et.',
    'Could not connect to the local Kumru server at 127.0.0.1:8000. Start vLLM and check the server.': '127.0.0.1:8000 adresindeki Kumru sunucusuna bağlanılamadı. vLLM sunucusunu başlatıp bağlantıyı denetle.',
    'Paste the full API key without spaces.': 'Boşluk içermeyen API anahtarının tamamını yapıştır.',
    'Windows secure storage is not available, so the API key cannot be saved.': 'Windows güvenli depolaması kullanılamıyor; API anahtarı kaydedilemedi.',
    'The saved API key could not be decrypted on this Windows account. Enter it again.': 'Kayıtlı API anahtarı bu Windows hesabında çözülemedi. Anahtarı yeniden gir.',
    'Could not reach Google Gemini. Check the internet connection.': 'Google Gemini sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.',
    'Could not load this folder.': 'Klasör içeriği yüklenemedi.',
    'Could not delete this item.': 'Öğe silinemedi.',
    'Could not complete this change.': 'İşlem tamamlanamadı.',
    'Open a workspace folder first.': 'Önce bir çalışma klasörü aç.',
    'Choose an existing folder as the workspace.': 'Çalışma alanı olarak var olan bir klasör seç.',
    'Only regular workspace files can be opened.': 'Yalnızca çalışma klasöründeki normal dosyalar açılabilir.',
    'Only existing regular workspace files can be saved.': 'Yalnızca çalışma klasöründeki mevcut dosyalar kaydedilebilir.',
    'This file is larger than the 5 MB editor limit.': 'Dosya, düzenleyicinin 5 MB sınırından büyük.',
    'This looks like a binary file and cannot be opened as text.': 'Bu ikili bir dosya gibi görünüyor; metin olarak açılamaz.',
    'This file is not valid UTF-8 text.': 'Dosya geçerli UTF-8 metni değil.',
    'File contents must be text.': 'Dosya içeriği metin olmalıdır.',
    'The requested path must be inside the current workspace.': 'Seçilen yol açık çalışma klasörünün içinde olmalıdır.',
    'Symbolic links cannot be changed from the explorer.': 'Gezgin üzerinden simgesel bağlantılar değiştirilemez.',
    'The workspace folder itself cannot be changed from the explorer.': 'Çalışma klasörünün kendisi gezgin üzerinden değiştirilemez.',
    'New items can only be created inside a folder.': 'Yeni öğeler yalnızca bir klasörün içinde oluşturulabilir.',
    'The integrated terminal is available in the Windows build.': 'Entegre terminal yalnızca Windows sürümünde kullanılabilir.',
    'Enter a valid OpenAI-compatible base URL ending in /v1.': 'Sonu /v1 ile biten geçerli bir OpenAI uyumlu sunucu adresi gir.',
    'Use a base URL ending in /v1. Do not put credentials, a query, or a fragment in the URL.': 'Sunucu adresi /v1 ile bitmeli. Adrese kullanıcı bilgisi, sorgu veya parça ekleme.',
    'Remote providers must use HTTPS. HTTP is allowed only for localhost.': 'Uzak sağlayıcılar HTTPS kullanmalıdır. HTTP yalnızca localhost için kullanılabilir.',
    'API keys must be at most 512 characters and contain no spaces.': 'API anahtarı en fazla 512 karakter olabilir ve boşluk içeremez.',
    'Unknown AI provider.': 'Bilinmeyen yapay zekâ sağlayıcısı.',
    'Choose a model first.': 'Önce bir model seç.',
    'The conversation is too long. Start a new chat.': 'Sohbet çok uzadı. Yeni bir sohbet başlat.',
    'Write a message first.': 'Önce bir mesaj yaz.',
    'This AI provider is no longer available. Refresh provider settings.': 'Bu yapay zekâ sağlayıcısı artık kullanılamıyor. Sağlayıcı ayarlarını yenile.',
    'Custom providers do not have a key page.': 'Özel sağlayıcı için API anahtarı sayfası bulunmuyor.',
    'Kumru uses the local inference server and does not need an API key.': 'Kumru yerel sunucuda çalışır ve API anahtarı gerektirmez.',
    'Provider settings are invalid.': 'Sağlayıcı ayarları geçersiz.',
    'Choose whether this endpoint supports Agent tools.': 'Bu sunucunun Ajan araçlarını destekleyip desteklemediğini seç.',
    'The API key must be text.': 'API anahtarı metin olmalıdır.',
    'Choose an existing custom provider.': 'Var olan bir özel sağlayıcı seç.',
    'Open a workspace before using Agent mode.': 'Ajan modunu kullanmadan önce bir çalışma klasörü aç.',
    'This path looks like a secret or credential file and cannot be read by Agent mode.': 'Bu yol gizli bilgi veya kimlik bilgisi dosyası gibi görünüyor; Ajan tarafından okunamaz.',
    'Agent mode cannot edit a path that looks like a secret or credential file.': 'Ajan modu gizli bilgi veya kimlik bilgisi dosyası gibi görünen bir yolu düzenleyemez.',
    'The Agent mode file-reading budget is exhausted for this task.': 'Bu görev için Ajanın dosya okuma sınırına ulaşıldı.',
    'Save or discard open editor changes before approving an Agent edit.': 'Ajan değişikliğini onaylamadan önce açık dosyaları kaydet veya değişiklikleri geri al.',
    'An editor buffer became unsaved while the approval was open. The file was not changed.': 'Onay ekranı açıkken dosyada kaydedilmemiş değişiklik oluştu. Dosya değiştirilmedi.',
    'The file changed while the approval was open. Review the proposal again.': 'Onay ekranı açıkken dosya değişti. Öneriyi yeniden incele.',
    'Save or discard editor changes before approving a command.': 'Komutu onaylamadan önce düzenleyicideki değişiklikleri kaydet veya geri al.',
    'An editor buffer became unsaved while the approval was open. The command was not run.': 'Onay ekranı açıkken dosyada kaydedilmemiş değişiklik oluştu. Komut çalıştırılmadı.',
    'The model returned invalid tool arguments.': 'Model geçersiz araç parametreleri döndürdü.',
    'The proposed file replacement is invalid or exceeds the 500,000-character Agent limit.': 'Önerilen dosya değişikliği geçersiz veya Ajanın 500.000 karakter sınırını aşıyor.',
    'This file is too large for a reviewed Agent replacement.': 'Bu dosya, onaylı Ajan değişikliği için fazla büyük.',
    'The proposed PowerShell command is empty or too long.': 'Önerilen PowerShell komutu boş veya çok uzun.',
    'The requested tool is unavailable:': 'İstenen araç kullanılamıyor:',
  }
  return known[message] ?? message
}
