import { conform, useForm } from '@conform-to/react'
import { getFieldsetConstraint, parse } from '@conform-to/zod'
import * as E from '@react-email/components'
import {
	json,
	redirect,
	type DataFunctionArgs,
	type MetaFunction,
} from '@remix-run/node'
import { Link, useFetcher } from '@remix-run/react'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { emailSchema, usernameSchema } from '#app/utils/user-validation.ts'

const ForgotPasswordSchema = z.object({
	usernameOrEmail: z.union([emailSchema, usernameSchema]),
})

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.formData()
	const submission = await parse(formData, {
		schema: ForgotPasswordSchema.superRefine(async (data, ctx) => {
			const user = await prisma.user.findFirst({
				where: {
					OR: [
						{ email: data.usernameOrEmail },
						{ username: data.usernameOrEmail },
					],
				},
				select: { id: true },
			})
			if (!user) {
				ctx.addIssue({
					path: ['usernameOrEmail'],
					code: z.ZodIssueCode.custom,
					message: 'No user exists with this username or email',
				})
				return
			}
		}),
		async: true,
	})
	if (submission.intent !== 'submit') {
		return json({ status: 'idle', submission } as const)
	}
	if (!submission.value) {
		return json({ status: 'error', submission } as const, { status: 400 })
	}
	const { usernameOrEmail } = submission.value

	const user = await prisma.user.findFirstOrThrow({
		where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
		select: { email: true, username: true },
	})

	// 🐨 create a verification code for the user using the prepareVerification
	// utility in ./verify.tsx
	// 🐨 it should be valid for at least 10 minutes and the target should be
	// the usernameOrEmail. Also, you'll need to create a new verification type in
	// ./verify.tsx for this first

	const redirectTo = 'You get this from prepareVerification'
	const verifyUrl = 'You get this from prepareVerification'
	const otp = 'You get this from prepareVerification'

	const response = await sendEmail({
		to: user.email,
		subject: `Epic Notes Password Reset`,
		react: (
			<ForgotPasswordEmail onboardingUrl={verifyUrl.toString()} otp={otp} />
		),
	})

	if (response.status === 'success') {
		return redirect(redirectTo.toString())
	} else {
		submission.error[''] = [response.error.message]
		return json({ status: 'error', submission } as const, { status: 500 })
	}
}

function ForgotPasswordEmail({
	onboardingUrl,
	otp,
}: {
	onboardingUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Epic Notes Password Reset</E.Text>
				</h1>
				<p>
					<E.Text>
						Here's your verification code: <strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>Or click the link:</E.Text>
				</p>
				<E.Link href={onboardingUrl}>{onboardingUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export const meta: MetaFunction = () => {
	return [{ title: 'Password Recovery for Epic Notes' }]
}

export default function ForgotPasswordRoute() {
	const forgotPassword = useFetcher<typeof action>()

	const [form, fields] = useForm({
		id: 'forgot-password-form',
		constraint: getFieldsetConstraint(ForgotPasswordSchema),
		lastSubmission: forgotPassword.data?.submission,
		onValidate({ formData }) {
			return parse(formData, { schema: ForgotPasswordSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="container pb-32 pt-20">
			<div className="flex flex-col justify-center">
				<div className="text-center">
					<h1 className="text-h1">Forgot Password</h1>
					<p className="mt-3 text-body-md text-muted-foreground">
						No worries, we'll send you reset instructions.
					</p>
				</div>
				<div className="mx-auto mt-16 min-w-[368px] max-w-sm">
					<forgotPassword.Form method="POST" {...form.props}>
						<div>
							<Field
								labelProps={{
									htmlFor: fields.usernameOrEmail.id,
									children: 'Username or Email',
								}}
								inputProps={{
									autoFocus: true,
									...conform.input(fields.usernameOrEmail),
								}}
								errors={fields.usernameOrEmail.errors}
							/>
						</div>
						<ErrorList errors={form.errors} id={form.errorId} />

						<div className="mt-6">
							<StatusButton
								className="w-full"
								status={
									forgotPassword.state === 'submitting'
										? 'pending'
										: forgotPassword.data?.status ?? 'idle'
								}
								type="submit"
								disabled={forgotPassword.state !== 'idle'}
							>
								Recover password
							</StatusButton>
						</div>
					</forgotPassword.Form>
					<Link
						to="/login"
						className="mt-11 text-center text-body-sm font-bold"
					>
						Back to Login
					</Link>
				</div>
			</div>
		</div>
	)
}

export function ErrorBoundary() {
	return <GeneralErrorBoundary />
}
