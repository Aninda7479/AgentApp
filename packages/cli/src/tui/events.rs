use std::time::Duration;
use crossterm::event::{Event as CrosstermEvent, KeyEvent, MouseEvent};
use futures_util::StreamExt;
use superagent_core_v2::types::AgentEvent;
use tokio::sync::mpsc;

#[derive(Debug)]
pub enum AppEvent {
    Key(KeyEvent),
    Mouse(MouseEvent),
    Resize(u16, u16),
    Agent(AgentEvent),
    Tick,
}

pub struct EventHandler {
    pub rx: mpsc::Receiver<AppEvent>,
    pub tx: mpsc::Sender<AppEvent>,
}

impl EventHandler {
    pub fn new(tick_rate: Duration) -> Self {
        let (tx, rx) = mpsc::channel(200);
        let event_tx = tx.clone();

        tokio::spawn(async move {
            let mut reader = crossterm::event::EventStream::new();
            let mut tick_interval = tokio::time::interval(tick_rate);

            loop {
                let tick_delay = tick_interval.tick();
                let crossterm_event = reader.next();

                tokio::select! {
                    _ = tick_delay => {
                        if event_tx.send(AppEvent::Tick).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(evt)) = crossterm_event => {
                        match evt {
                            CrosstermEvent::Key(key) => {
                                if event_tx.send(AppEvent::Key(key)).await.is_err() {
                                    break;
                                }
                            }
                            CrosstermEvent::Mouse(mouse) => {
                                if event_tx.send(AppEvent::Mouse(mouse)).await.is_err() {
                                    break;
                                }
                            }
                            CrosstermEvent::Resize(w, h) => {
                                if event_tx.send(AppEvent::Resize(w, h)).await.is_err() {
                                    break;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        });

        Self { rx, tx }
    }
}
