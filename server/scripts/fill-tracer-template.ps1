param(
  [Parameter(Mandatory = $true)][string]$TemplatePath,
  [Parameter(Mandatory = $true)][string]$PayloadPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [string]$Format = "docx"
)

$payload = Get-Content -LiteralPath $PayloadPath -Raw | ConvertFrom-Json

function CleanText([object]$value) {
  if ($null -eq $value) { return "" }
  return [string]$value
}

function Replace-All($document, [string]$findText, [string]$replaceText) {
  if ([string]::IsNullOrWhiteSpace($findText)) { return }

  $range = $document.Content
  $find = $range.Find
  $find.ClearFormatting()
  $find.Replacement.ClearFormatting()
  $find.Text = $findText
  $find.Replacement.Text = $replaceText
  $find.Forward = $true
  $find.Wrap = 1
  $find.Format = $false
  $find.MatchCase = $false
  $find.MatchWholeWord = $false
  $find.MatchWildcards = $false
  $find.Execute($findText, $false, $false, $false, $false, $false, $true, 1, $false, $replaceText, 2) | Out-Null
}

function Mark-Option($document, [string]$label, [bool]$selected) {
  if (-not $selected) { return }

  $variants = @(
    "[ ] $label",
    "[  ] $label",
    "[   ] $label",
    "[    ] $label",
    "[     ] $label"
  )

  foreach ($variant in $variants) {
    Replace-All $document $variant "[X] $label"
  }
}

$word = $null
$document = $null

try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0

  $document = $word.Documents.Open($TemplatePath)

  Replace-All $document "Name_____________________________________________________________________________" ("Name " + (CleanText $payload.fullName))
  Replace-All $document "Permanent Address_________________________________________________________________" ("Permanent Address " + (CleanText $payload.permanentAddress))
  Replace-All $document "E-mail Address _____________________________________________________________________" ("E-mail Address " + (CleanText $payload.email))
  Replace-All $document "Telephone or Contact Number(s) ______________________________________________________" ("Telephone or Contact Number(s) " + (CleanText $payload.telephoneNumber))
  Replace-All $document "Mobile Number_____________________________________________________________________" ("Mobile Number " + (CleanText $payload.mobileNumber))
  Replace-All $document "Province _______________________________________________________________________" ("Province " + (CleanText $payload.province))
  Replace-All $document "Degree(s) & Specialization(s)" ("Degree(s) & Specialization(s) " + (CleanText $payload.degree) + " " + (CleanText $payload.specialization))
  Replace-All $document "College or University" ("College or University " + (CleanText $payload.collegeOrUniversity))
  Replace-All $document "Year Graduated" ("Year Graduated " + (CleanText $payload.yearGraduated))
  Replace-All $document "Honor(s) or Award(s) Received" ("Honor(s) or Award(s) Received " + (CleanText $payload.honorsOrAwards))
  Replace-All $document "Name of Examination" ("Name of Examination " + (CleanText $payload.professionalExamination))
  Replace-All $document "Date Taken" ("Date Taken " + (CleanText $payload.professionalExaminationDate))
  Replace-All $document "Rating" ("Rating " + (CleanText $payload.professionalExaminationRating))
  Replace-All $document "Others, please specify _____________________________________________________________________" ("Others, please specify " + (CleanText $payload.reasonsForCourseOther))
  Replace-All $document "Others, please specify____________________________________________________________" ("Others, please specify " + (CleanText $payload.reasonsForAdvanceStudiesOther))
  Replace-All $document "If self-employed, what skills acquired in college were you able to apply in your work? ___________________________________________________________________________________" ("If self-employed, what skills acquired in college were you able to apply in your work? " + (CleanText $payload.selfEmployedSkills))
  Replace-All $document "_____________________________________________________________________________________20. Major line of business of the company you are presently employed in. Check one only." (" " + (CleanText $payload.presentOccupation) + " 20. Major line of business of the company you are presently employed in. Check one only.")
  Replace-All $document "Other reason(s), please specify_________________________________________" ("Other reason(s), please specify " + (CleanText $payload.reasonsForStayingOther))
  Replace-All $document "Other reason(s), please specify___________________________________________________" ("Other reason(s), please specify " + (CleanText $payload.reasonsForAcceptingJobOther))
  Replace-All $document "Other reason(s), please specify___________________________________________________What were your reason(s) for changing job?" ("Other reason(s), please specify " + (CleanText $payload.reasonsForAcceptingJobOther) + " What were your reason(s) for changing job?")
  Replace-All $document "Others, please specify _______________________" ("Others, please specify " + (CleanText $payload.firstJobDurationOther))
  Replace-All $document "Others, please specify_____________________________________________________" ("Others, please specify " + (CleanText $payload.firstJobFindingWaysOther))
  Replace-All $document "Others, please specify ____________________________" ("Others, please specify " + (CleanText $payload.timeToLandFirstJobOther))
  Replace-All $document "Other skills, please specify_______________________________________________________" ("Other skills, please specify " + (CleanText $payload.usefulCompetenciesOther))
  Replace-All $document "List down suggestions to further improve your course curriculum" ("List down suggestions to further improve your course curriculum " + (CleanText $payload.curriculumSuggestions))

  Mark-Option $document "Single" ((CleanText $payload.civilStatus) -eq "Single")
  Mark-Option $document "Married" ((CleanText $payload.civilStatus) -eq "Married")
  Mark-Option $document "Separated" ((CleanText $payload.civilStatus) -eq "Separated")
  Mark-Option $document "Widow or Widower" ((CleanText $payload.civilStatus) -eq "Widow or Widower")
  Mark-Option $document "Single Parent" ((CleanText $payload.civilStatus) -eq "Single Parent")
  Mark-Option $document "Male" ((CleanText $payload.sex) -eq "Male")
  Mark-Option $document "Female" ((CleanText $payload.sex) -eq "Female")
  Mark-Option $document (CleanText $payload.regionOfOrigin) $true
  Mark-Option $document (CleanText $payload.residenceType) $true
  Mark-Option $document "For promotion" (($payload.reasonsForAdvanceStudies -contains "For promotion"))
  Mark-Option $document "For professional development" (($payload.reasonsForAdvanceStudies -contains "For professional development"))
  Mark-Option $document "Yes" ((CleanText $payload.presentlyEmployed) -eq "Yes")
  Mark-Option $document "No" ((CleanText $payload.presentlyEmployed) -eq "No")
  Mark-Option $document "Never Employed" ((CleanText $payload.presentlyEmployed) -eq "Never Employed")
  Mark-Option $document (CleanText $payload.presentEmploymentStatus) $true
  Mark-Option $document (CleanText $payload.companyBusinessLine) $true
  Mark-Option $document (CleanText $payload.placeOfWork) $true
  Mark-Option $document "Yes" ((CleanText $payload.firstJobAfterCollege) -eq "Yes")
  Mark-Option $document "No" ((CleanText $payload.firstJobAfterCollege) -eq "No")
  Mark-Option $document (CleanText $payload.firstJobDuration) $true
  Mark-Option $document (CleanText $payload.timeToLandFirstJob) $true
  Mark-Option $document (CleanText $payload.jobLevelFirstJob) $true
  Mark-Option $document (CleanText $payload.jobLevelCurrentJob) $true
  Mark-Option $document (CleanText $payload.initialGrossMonthlyEarning) $true
  Mark-Option $document "Yes" ((CleanText $payload.curriculumRelevantToFirstJob) -eq "Yes")
  Mark-Option $document "No" ((CleanText $payload.curriculumRelevantToFirstJob) -eq "No")

  foreach ($option in @($payload.reasonsForCourse)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.unemploymentReasons)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.reasonsForStaying)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.reasonsForAcceptingJob)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.reasonsForChangingJob)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.firstJobFindingWays)) { Mark-Option $document (CleanText $option) $true }
  foreach ($option in @($payload.usefulCompetencies)) { Mark-Option $document (CleanText $option) $true }

  if ($Format -eq "pdf") {
    $document.SaveAs([ref]$OutputPath, [ref]17)
  } else {
    $document.SaveAs([ref]$OutputPath, [ref]16)
  }
} finally {
  if ($document) {
    $document.Close()
  }
  if ($word) {
    $word.Quit()
  }
}
