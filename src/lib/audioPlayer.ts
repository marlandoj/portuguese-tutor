// Single shared audio element with segment playback support

let audio: HTMLAudioElement | null = null;
let stopTimer: number | null = null;

export function playSegment(url: string, start: number, end?: number) {
  stopAudio();
  if (!audio) audio = new Audio();
  audio.src = url;
  audio.currentTime = start;
  if (end && end > start) {
    const onTime = () => {
      if (audio && audio.currentTime >= end) stopAudio();
    };
    audio.addEventListener("timeupdate", onTime);
    stopTimer = window.setTimeout(() => {
      audio?.removeEventListener("timeupdate", onTime);
    }, (end - start + 1.5) * 1000);
  }
  void audio.play().catch(() => {});
}

export function stopAudio() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
}
