import { NextResponse } from "next/server";

import { UnauthorizedError } from "@/lib/auth/session";
import {
  DocumentDeletionError,
  DocumentValidationError,
} from "@/lib/documents/service";
import { PermissionDeniedError } from "@/lib/rbac";
import { WorkflowAdvanceError, WorkflowSkipError } from "@/lib/workflow/advance-workflow";

export function apiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof DocumentValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof DocumentDeletionError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof WorkflowSkipError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof WorkflowAdvanceError) {
    return NextResponse.json(
      { error: error.message, blockers: error.blockers },
      { status: 403 },
    );
  }
  if (error instanceof Error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
}
