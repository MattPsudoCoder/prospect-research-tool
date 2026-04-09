const { cloneTemplates } = require('../services/outreach');

describe('cloneTemplates', () => {
  const sourceTemplates = {
    step1_linkedin_connect: 'Hi Jane, noticed Acme is hiring React devs.',
    step2a_intro_accepted: 'Jane, great to connect. As VP Engineering, you must be driving the React migration.',
    step3_email: 'Hi Jane Smith, I wanted to discuss your engineering hiring.',
  };

  test('replaces full name', () => {
    const result = cloneTemplates(sourceTemplates, 'Jane Smith', 'VP Engineering', 'Bob Jones', 'CTO');
    expect(result.step3_email).toContain('Bob Jones');
    expect(result.step3_email).not.toContain('Jane Smith');
  });

  test('replaces first name', () => {
    const result = cloneTemplates(sourceTemplates, 'Jane Smith', 'VP Engineering', 'Bob Jones', 'CTO');
    expect(result.step1_linkedin_connect).toContain('Bob');
    expect(result.step1_linkedin_connect).not.toContain('Jane');
  });

  test('replaces title', () => {
    const result = cloneTemplates(sourceTemplates, 'Jane Smith', 'VP Engineering', 'Bob Jones', 'CTO');
    expect(result.step2a_intro_accepted).toContain('CTO');
    expect(result.step2a_intro_accepted).not.toContain('VP Engineering');
  });

  test('handles null values in templates', () => {
    const templates = { step1: 'Hi Jane', step2: null };
    const result = cloneTemplates(templates, 'Jane Smith', 'VP', 'Bob Jones', 'CTO');
    expect(result.step1).toContain('Bob');
    expect(result).not.toHaveProperty('step2');
  });

  test('handles missing title gracefully', () => {
    const result = cloneTemplates(sourceTemplates, 'Jane Smith', '', 'Bob Jones', '');
    expect(result.step1_linkedin_connect).toContain('Bob');
  });

  test('preserves template keys', () => {
    const result = cloneTemplates(sourceTemplates, 'Jane Smith', 'VP Engineering', 'Bob Jones', 'CTO');
    expect(Object.keys(result)).toEqual(Object.keys(sourceTemplates));
  });

  test('handles object-type template values', () => {
    const templates = {
      step3_email: { subject: 'Hi Jane', body: 'Jane Smith, let us talk about VP Engineering roles.' },
    };
    const result = cloneTemplates(templates, 'Jane Smith', 'VP Engineering', 'Bob Jones', 'CTO');
    expect(result.step3_email.subject).toContain('Bob');
    expect(result.step3_email.body).toContain('Bob Jones');
    expect(result.step3_email.body).toContain('CTO');
  });
});
