const { analyseNotes, NEGATIVE_SIGNAL_PHRASES, IGNORED_NOTE_ACTIONS } = require('../services/bullhorn');

describe('analyseNotes', () => {
  test('returns empty results for empty notes', () => {
    const result = analyseNotes([]);
    expect(result.recentNotes).toEqual([]);
    expect(result.lastMeaningfulActivity).toBe('');
    expect(result.negativeSignals).toEqual([]);
  });

  test('filters out mass email / mailshot actions', () => {
    const notes = [
      { action: 'Mailshot', dateAdded: Date.now(), comments: 'Mass outreach' },
      { action: 'Mass Email', dateAdded: Date.now(), comments: 'Bulk send' },
      { action: 'BD Message', dateAdded: Date.now(), comments: 'Real note' },
    ];
    const result = analyseNotes(notes);
    expect(result.recentNotes).toHaveLength(1);
    expect(result.recentNotes[0].action).toBe('BD Message');
  });

  test('detects negative signals in comments', () => {
    const notes = [
      { action: 'Note', dateAdded: Date.now(), comments: 'Client said do not contact again' },
    ];
    const result = analyseNotes(notes);
    expect(result.negativeSignals).toContain('do not contact');
  });

  test('detects hiring freeze', () => {
    const notes = [
      { action: 'Note', dateAdded: Date.now(), comments: 'They have a hiring freeze until Q3' },
    ];
    const result = analyseNotes(notes);
    expect(result.negativeSignals).toContain('hiring freeze');
  });

  test('detects "no agencies"', () => {
    const notes = [
      { action: 'Note', dateAdded: Date.now(), comments: 'They said no recruitment agencies' },
    ];
    const result = analyseNotes(notes);
    expect(result.negativeSignals).toContain('no recruitment agencies');
  });

  test('does not duplicate negative signals', () => {
    const notes = [
      { action: 'Note', dateAdded: Date.now(), comments: 'do not contact — confirmed DNC' },
      { action: 'Note', dateAdded: Date.now() - 100000, comments: 'Reminder: do not contact' },
    ];
    const result = analyseNotes(notes);
    const dncCount = result.negativeSignals.filter(s => s === 'do not contact').length;
    expect(dncCount).toBe(1);
  });

  test('limits recent notes to 10', () => {
    const notes = Array.from({ length: 20 }, (_, i) => ({
      action: 'Note',
      dateAdded: Date.now() - i * 100000,
      comments: `Note ${i}`,
    }));
    const result = analyseNotes(notes);
    expect(result.recentNotes).toHaveLength(10);
  });

  test('extracts lastMeaningfulActivity from first note date', () => {
    const d = new Date('2026-03-15T12:00:00Z');
    const notes = [
      { action: 'Note', dateAdded: d.getTime(), comments: 'Latest' },
      { action: 'Note', dateAdded: d.getTime() - 86400000, comments: 'Older' },
    ];
    const result = analyseNotes(notes);
    expect(result.lastMeaningfulActivity).toBe('2026-03-15');
  });

  test('truncates comment snippets to 150 chars', () => {
    const longComment = 'A'.repeat(300);
    const notes = [{ action: 'Note', dateAdded: Date.now(), comments: longComment }];
    const result = analyseNotes(notes);
    expect(result.recentNotes[0].snippet.length).toBe(150);
  });

  test('extracts person reference name', () => {
    const notes = [{
      action: 'Note',
      dateAdded: Date.now(),
      comments: 'Spoke with client',
      personReference: { firstName: 'Jane', lastName: 'Smith' },
    }];
    const result = analyseNotes(notes);
    expect(result.recentNotes[0].person).toBe('Jane Smith');
  });

  test('handles missing personReference gracefully', () => {
    const notes = [{ action: 'Note', dateAdded: Date.now(), comments: 'Test' }];
    const result = analyseNotes(notes);
    expect(result.recentNotes[0].person).toBe('');
  });

  // Ensure all negative signal phrases are detectable
  test('every NEGATIVE_SIGNAL_PHRASE is detectable', () => {
    for (const phrase of NEGATIVE_SIGNAL_PHRASES) {
      const notes = [{ action: 'Note', dateAdded: Date.now(), comments: `Context: ${phrase} was mentioned` }];
      const result = analyseNotes(notes);
      expect(result.negativeSignals).toContain(phrase);
    }
  });
});
