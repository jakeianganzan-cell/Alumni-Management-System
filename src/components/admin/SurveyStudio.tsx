import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { BarChart2, ClipboardList, Loader2, Plus, Trash2 } from "lucide-react";
import { API_URL, getAuthHeaders, readApiResponse } from "@/lib/api";
import DurationBadge from "@/components/DurationBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type QuestionType = "short_text" | "long_text" | "single_choice" | "multiple_choice" | "rating" | "yes_no";

interface SurveyQuestion {
  id?: number;
  questionText: string;
  questionType: QuestionType;
  isRequired: boolean;
  options: string[];
  minRating?: number | null;
  maxRating?: number | null;
  placeholder?: string | null;
}

interface SurveyRecord {
  id: number;
  title: string;
  description: string | null;
  surveyType: string;
  status: string;
  targetAudience: string;
  isAnonymous: boolean;
  allowMultipleResponses: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  computed_status?: string | null;
  duration_status?: string | null;
  remaining_time?: string | null;
  responseCount: number;
  questions: SurveyQuestion[];
}

interface SurveyResponseRow {
  id: number;
  respondentName: string;
  course?: string | null;
  batch?: string | null;
  questionText: string;
  questionType: QuestionType;
  answerText?: string | null;
  answerValue?: string | null;
  answerJson?: string[] | null;
  ratingValue?: number | null;
  submittedAt: string;
}

const blankQuestion = (): SurveyQuestion => ({
  questionText: "",
  questionType: "single_choice",
  isRequired: true,
  options: ["Yes", "No"],
  minRating: 1,
  maxRating: 5,
  placeholder: "",
});

const BLANK_FORM = {
  title: "",
  description: "",
  surveyType: "general",
  status: "published",
  targetAudience: "all_alumni",
  start_date: "",
  start_time: "08:00",
  end_date: "",
  end_time: "17:00",
  isAnonymous: false,
  allowMultipleResponses: false,
  questions: [blankQuestion()],
};

export default function SurveyStudio() {
  const [surveys, setSurveys] = useState<SurveyRecord[]>([]);
  const [responses, setResponses] = useState<SurveyResponseRow[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<SurveyRecord | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSurveys = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/surveys`, { headers: getAuthHeaders() });
      setSurveys(await readApiResponse<SurveyRecord[]>(response));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSurveys();
  }, []);

  const loadResponses = async (survey: SurveyRecord) => {
    setSelectedSurvey(survey);
    const response = await fetch(`${API_URL}/surveys/${survey.id}/responses`, { headers: getAuthHeaders() });
    setResponses(await readApiResponse<SurveyResponseRow[]>(response));
  };

  const responseSummary = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    responses.forEach((row) => {
      const question = row.questionText;
      const value = row.answerJson?.length ? row.answerJson.join(", ") : String(row.answerValue || row.answerText || row.ratingValue || "No answer");
      if (!map.has(question)) map.set(question, new Map());
      const values = map.get(question)!;
      values.set(value, (values.get(value) || 0) + 1);
    });
    return Array.from(map.entries()).map(([question, values]) => ({
      question,
      values: Array.from(values.entries()).sort((a, b) => b[1] - a[1]),
    }));
  }, [responses]);

  const updateQuestion = (index: number, updates: Partial<SurveyQuestion>) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question, questionIndex) => questionIndex === index ? { ...question, ...updates } : question),
    }));
  };

  const handleQuestionOptions = (index: number, value: string) => {
    updateQuestion(index, { options: value.split("\n").map((item) => item.trim()).filter(Boolean) });
  };

  const saveSurvey = async () => {
    if (!form.title.trim() || form.questions.some((question) => !question.questionText.trim())) return;
    try {
      setSaving(true);
      const payload = {
        title: form.title,
        description: form.description,
        surveyType: form.surveyType,
        status: form.status,
        targetAudience: form.targetAudience,
        isAnonymous: form.isAnonymous,
        allowMultipleResponses: form.allowMultipleResponses,
        start_date: form.start_date,
        start_time: form.start_time,
        end_date: form.end_date,
        end_time: form.end_time,
        questions: form.questions,
      };
      const response = await fetch(editingId ? `${API_URL}/surveys/${editingId}` : `${API_URL}/surveys`, {
        method: editingId ? "PUT" : "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readApiResponse(response);
      setForm(BLANK_FORM);
      setEditingId(null);
      await loadSurveys();
    } finally {
      setSaving(false);
    }
  };

  const editSurvey = (survey: SurveyRecord) => {
    setEditingId(survey.id);
    setForm({
      title: survey.title,
      description: survey.description || "",
      surveyType: survey.surveyType || "general",
      status: survey.status || "published",
      targetAudience: survey.targetAudience || "all_alumni",
      start_date: survey.start_datetime ? String(survey.start_datetime).slice(0, 10) : "",
      start_time: survey.start_datetime ? String(survey.start_datetime).slice(11, 16) : "08:00",
      end_date: survey.end_datetime ? String(survey.end_datetime).slice(0, 10) : "",
      end_time: survey.end_datetime ? String(survey.end_datetime).slice(11, 16) : "17:00",
      isAnonymous: survey.isAnonymous,
      allowMultipleResponses: survey.allowMultipleResponses,
      questions: survey.questions.length ? survey.questions : [blankQuestion()],
    });
  };

  const deleteSurvey = async (surveyId: number) => {
    if (!window.confirm("Delete this survey and its responses?")) return;
    const response = await fetch(`${API_URL}/surveys/${surveyId}`, { method: "DELETE", headers: getAuthHeaders() });
    await readApiResponse(response);
    await loadSurveys();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Internal Surveys</p>
          <h2 className="text-lg font-semibold text-navy-dark">All surveys and create survey</h2>
        </div>
        <Badge variant="outline">{surveys.length} surveys</Badge>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-navy-dark">All surveys</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Review published, draft, closed, and archived survey questionnaires.</p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{surveys.length}</span>
          </div>

          <div className="max-h-[760px] space-y-3 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading surveys...</div>
          ) : surveys.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-muted-foreground">No internal surveys yet.</div>
          ) : (
            surveys.map((survey) => (
              <article key={survey.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">{survey.status}</Badge>
                      <DurationBadge status={survey.computed_status || survey.duration_status} remainingTime={survey.remaining_time} startDatetime={survey.start_datetime} endDatetime={survey.end_datetime} />
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-navy-dark">{survey.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{survey.description || "No description"}</p>
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">{survey.questions.length} questions | {survey.responseCount} responses</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadResponses(survey)}><BarChart2 className="mr-2 h-4 w-4" />Analyze</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => editSurvey(survey)}>Edit</Button>
                    <Button type="button" size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void deleteSurvey(survey.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </article>
            ))
          )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-navy-dark">{editingId ? "Update survey" : "Create survey"}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Build the questionnaire, set availability, and publish it for alumni.</p>
          </div>
          <div className="space-y-4">
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Survey title" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Survey description" rows={3} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="closed">Closed</option>
                <option value="archived">Archived</option>
              </select>
              <select value={form.surveyType} onChange={(event) => setForm((current) => ({ ...current, surveyType: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                <option value="general">General</option>
                <option value="before_event">Before event</option>
                <option value="after_event">After event</option>
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input type="date" value={form.start_date} onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <input type="time" value={form.start_time} onChange={(event) => setForm((current) => ({ ...current, start_time: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <input type="date" value={form.end_date} onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
              <input type="time" value={form.end_time} onChange={(event) => setForm((current) => ({ ...current, end_time: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={form.isAnonymous} onChange={(event) => setForm((current) => ({ ...current, isAnonymous: event.target.checked }))} />
                Anonymous responses
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                <input type="checkbox" checked={form.allowMultipleResponses} onChange={(event) => setForm((current) => ({ ...current, allowMultipleResponses: event.target.checked }))} />
                Allow multiple responses
              </label>
            </div>

            <div className="space-y-3">
              {form.questions.map((question, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
                  <input value={question.questionText} onChange={(event) => updateQuestion(index, { questionText: event.target.value })} placeholder={`Question ${index + 1}`} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <select value={question.questionType} onChange={(event: ChangeEvent<HTMLSelectElement>) => updateQuestion(index, { questionType: event.target.value as QuestionType })} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                      <option value="short_text">Short text</option>
                      <option value="long_text">Long text</option>
                      <option value="single_choice">Single choice</option>
                      <option value="multiple_choice">Multiple choice</option>
                      <option value="rating">Rating</option>
                      <option value="yes_no">Yes / No</option>
                    </select>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={question.isRequired} onChange={(event) => updateQuestion(index, { isRequired: event.target.checked })} /> Required</label>
                  </div>
                  {["single_choice", "multiple_choice"].includes(question.questionType) && (
                    <textarea value={question.options.join("\n")} onChange={(event) => handleQuestionOptions(index, event.target.value)} rows={3} className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="One choice per line" />
                  )}
                  <Button type="button" size="sm" variant="outline" className="mt-2 border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setForm((current) => ({ ...current, questions: current.questions.filter((_, questionIndex) => questionIndex !== index) }))} disabled={form.questions.length === 1}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, blankQuestion()] }))}><Plus className="mr-2 h-4 w-4" />Add question</Button>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void saveSurvey()} disabled={saving || !form.title.trim()}>{saving ? "Saving..." : editingId ? "Save survey" : "Create survey"}</Button>
              {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(BLANK_FORM); }}>Cancel</Button>}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={Boolean(selectedSurvey)} onOpenChange={(open) => !open && setSelectedSurvey(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {selectedSurvey && (
            <>
              <DialogHeader>
                <DialogTitle className="text-navy-dark">{selectedSurvey.title}</DialogTitle>
                <DialogDescription>{responses.length} submitted answer rows. Summaries group matching answers per question.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 lg:grid-cols-2">
                {responseSummary.map((item) => (
                  <div key={item.question} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <h3 className="text-sm font-semibold text-navy-dark">{item.question}</h3>
                    <div className="mt-3 space-y-2">
                      {item.values.map(([answer, count]) => (
                        <div key={answer} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                          <span className="text-muted-foreground">{answer}</span>
                          <span className="font-semibold text-navy-dark">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {responses.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-muted-foreground">
                  <ClipboardList className="mx-auto mb-2 h-8 w-8" />
                  No responses yet.
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
