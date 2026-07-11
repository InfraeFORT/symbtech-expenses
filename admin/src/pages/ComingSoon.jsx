// src/pages/ComingSoon.jsx — écran provisoire pour un module en cours de structuration.
import React from 'react';

export default function ComingSoon({ title, note }) {
  return (
    <div className="card-block" style={{ textAlign: 'center', padding: '40px 24px' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="muted" style={{ maxWidth: 520, margin: '8px auto 0' }}>
        {note || 'Module à construire — l’emplacement est réservé dans la navigation. On le bâtira prochainement.'}
      </p>
    </div>
  );
}
