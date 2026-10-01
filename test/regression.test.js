import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { claimScheduledRun } from '../src/services/scheduler-lock.service.js';
import { prisma } from '../src/database/prisma.js';
import { startQuizCallback, answerQuestionCallback } from '../src/handlers/student/quiz.js';
import { deleteStudentCallback, addStudentConversation } from '../src/handlers/admin/students.js';
import { attendanceCallbackHandler } from '../src/handlers/admin/attendance.js';
import { closeQuizCallback } from '../src/handlers/admin/quizzes.js';

test('two processes sharing SQLite execute a scheduled slot once', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'school-bot-test-'));
  const url = `file:${join(dir, 'test.db').replaceAll('\\', '/')}`;
  const a = new PrismaClient({ datasources: { db: { url } } });
  const b = new PrismaClient({ datasources: { db: { url } } });
  try {
    const results = await Promise.all([claimScheduledRun(a, 'reminder', '2026-10-01T15:00'), claimScheduledRun(b, 'reminder', '2026-10-01T15:00')]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await claimScheduledRun(b, 'reminder', '2026-10-01T15:00'), false);
    assert.equal(await claimScheduledRun(b, 'reminder', '2026-10-02T15:00'), true);
  } finally { await a.$disconnect(); await b.$disconnect(); await rm(dir, { recursive: true, force: true }); }
});

test('non-admin cannot modify attendance, students or quizzes', async () => {
  const ctx = { from: { id: -1 } };
  for (const handler of [attendanceCallbackHandler, deleteStudentCallback, closeQuizCallback]) await handler(ctx);
  await addStudentConversation({}, ctx);
});

test('expired quiz cannot start from an old button', async () => {
  const studentFind = prisma.student.findUnique;
  const quizFind = prisma.quiz.findUnique;
  try {
    prisma.student.findUnique = async () => ({ id: 7 });
    prisma.quiz.findUnique = async () => ({ id: 8, isActive: true, deadline: new Date(0), questions: [] });
    let alert;
    await startQuizCallback({ from: { id: 99 }, callbackQuery: { data: 'start_test:8' }, answerCallbackQuery: async value => { alert = value; } });
    assert.equal(alert.show_alert, true);
  } finally { prisma.student.findUnique = studentFind; prisma.quiz.findUnique = quizFind; }
});

test('quiz rejects another user, invalid choices and repeated old answers; saves points atomically', async () => {
  const original = [prisma.student.findUnique, prisma.quiz.findUnique, prisma.quizSubmission.findUnique, prisma.$transaction];
  let saved = 0;
  let points = 0;
  let rendered;
  try {
    prisma.student.findUnique = async () => ({ id: 7 });
    prisma.quiz.findUnique = async () => ({ id: 8, isActive: true, deadline: null, questions: [1, 2].map(id => ({ id, text: 'Savol', options: '["1","2","3","4"]', correctIndex: 0 })) });
    prisma.quizSubmission.findUnique = async () => null;
    prisma.$transaction = async callback => callback({ quizSubmission: { create: async () => { saved++; } }, student: { update: async data => { points += data.data.points.increment; } } });
    const ctx = { from: { id: 99 }, callbackQuery: { data: 'start_test:8', message: { message_id: 100 } }, answerCallbackQuery: async () => {}, editMessageText: async (text, options) => { rendered = { text, options }; } };
    await startQuizCallback(ctx);
    const first = rendered.options.reply_markup.inline_keyboard[0][0].callback_data;
    ctx.callbackQuery.data = first;
    ctx.from.id = 98;
    await answerQuestionCallback(ctx);
    assert.match(rendered.text, /1\/2/);
    ctx.from.id = 99;
    ctx.callbackQuery.data = first.replace(':0:0:', ':9:0:');
    await answerQuestionCallback(ctx);
    assert.match(rendered.text, /1\/2/);
    ctx.callbackQuery.data = first;
    await Promise.all([answerQuestionCallback(ctx), answerQuestionCallback(ctx)]);
    assert.match(rendered.text, /2\/2/);
    await answerQuestionCallback(ctx);
    assert.equal(saved, 0);
    ctx.callbackQuery.data = rendered.options.reply_markup.inline_keyboard[0][0].callback_data;
    await answerQuestionCallback(ctx);
    assert.equal(saved, 1);
    assert.ok(points >= 0);
    await answerQuestionCallback(ctx);
    assert.equal(saved, 1);
  } finally {
    [prisma.student.findUnique, prisma.quiz.findUnique, prisma.quizSubmission.findUnique, prisma.$transaction] = original;
    await prisma.$disconnect();
  }
});
