# Set up taxes and payments

Before Vento can price a room or take a payment, it needs each hotel's taxes, the ways the hotel takes money, and the day's exchange rate for guests who pay in foreign cash. Finance or the owner sets these up once per hotel (about 10 minutes); a GM enters the day's FX rates.

## Set up a hotel's taxes
1. On **Home**, click **Set up** beside **Set up taxes and payments**, or go to **Settings** › **Taxes and charges**. If you see all your hotels, pick one.
2. Click **Set up for Lagos** (the button names your hotel's state). Vento adds VAT for the group, the state's consumption tax if it has one on file, and a 10% service charge for the hotel. If the state has no consumption tax on file, add it with **Add a tax or charge**.
3. Every rate starts with an amber **To verify** badge. These are starting values, not settled law. Check each one against the current law (for VAT, the Nigeria Tax Act 2025; for consumption tax, your state's law), then click **Mark verified**, type the act and section, and click **Mark verified** again. Your name and today's date are recorded.

The first night audit won't run while a rate in force is still To verify.

## See how a bill adds up
Under **How a bill adds up**, pick the kind of charge, type an amount and choose **Price excl. taxes** or **Price incl. taxes**. You see each line, any rounding and the total. Pick a later date to see a scheduled change. This is only a preview: whether prices include taxes is set on each rate plan and menu.

## Change a rate
Rates never change in place. Click **Schedule a change** on the tax, type the new rate (or choose **Stop charging it**), the start date, the source and a reason, and click **Schedule change**. Charges from that date use the new rate, including stays already booked; posted charges keep the rate they had. The start must be after the hotel's business date. To undo a change before it starts, click **Cancel change** and give a reason.

VAT covers every hotel in the group, so only someone with whole-group access can change it. A state tax can be changed only by someone with access to every hotel in that state.

## Payment methods, bank accounts and POS terminals
Go to **Settings** › **Payments**.
- **Payment methods:** switch each one on or off. Switching is undone with **Undo** on the message. Click **Edit** on Cash to take US dollars, pounds or euros as well as naira; foreign cash is taken at the day's CBN rate and posted in naira.
- **Bank accounts:** click **Add**, choose the bank, type the 10-digit account number and the name as the bank shows it. Tick "Guests at … pay transfers into this account" for the account guests are told to transfer to. Accounts belong to the company and are shared by every hotel it owns.
- **POS terminals:** click **Add**, type the provider, the name staff use ("Desk 1"), the terminal ID printed on the slips, and the account it settles into.

Once the hotel is live, adding or changing an account or terminal asks for a reason and shows in the owner's daily report. Changing the account guests transfer to also emails the owners straight away.

## Enter today's FX rates
Go to **Settings** › **FX rates**. Open the CBN rates page from the link, type the naira rate for each currency (blanks are fine) and click **Save rates**. If a rate is more than 10% away from the last one, Vento asks you to check it; click **Save anyway** if it's right. To fix a rate already saved for the day, save the new one and give a reason; the old one stays in the history.

## Offline
These pages need a connection to change anything. Offline they show what was saved on your device, and bills keep using the rules saved on each device.

## Related
- [Set up your rooms](../getting-started/set-up-rooms.md)
- [Switch between hotels](../getting-started/switch-between-hotels.md)
