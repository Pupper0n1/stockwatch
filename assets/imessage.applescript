on run argv
	set theMessage to item 1 of argv
	set theRecipient to item 2 of argv
	tell application "Messages"
		set targetService to 1st account whose service type = iMessage
		set targetBuddy to participant theRecipient of targetService
		send theMessage to targetBuddy
	end tell
end run
